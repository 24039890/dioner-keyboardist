"""API tests. YouTube is mocked with respx; no real API key or network is used."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.ratelimit import RateLimiter
from app.videos import build_query, clean_query
from app.youtube import API_BASE, parse_iso8601_duration

SEARCH_URL = f"{API_BASE}/search"
VIDEOS_URL = f"{API_BASE}/videos"


def search_payload(ids, next_token=None):
    return {"items": [{"id": {"kind": "youtube#video", "videoId": i}} for i in ids], "nextPageToken": next_token}


def videos_payload(ids):
    return {
        "items": [
            {
                "id": i,
                "snippet": {
                    "title": f"Lesson &amp; {i}",
                    "channelTitle": "Keys Academy",
                    "thumbnails": {"medium": {"url": f"https://i.ytimg.com/{i}.jpg"}},
                },
                "contentDetails": {"duration": "PT12M5S"},
            }
            for i in ids
        ]
    }


@pytest.fixture
def make_client():
    def _make(**overrides):
        values = {"youtube_api_key": "test-key", "rate_limit_per_minute": 100, **overrides}
        settings = Settings(_env_file=None, **values)
        return TestClient(create_app(settings, http=httpx.AsyncClient()))

    return _make


def test_health_reports_configuration(make_client):
    with make_client() as c:
        assert c.get("/health").json() == {
            "status": "ok",
            "version": "0.1.0",
            "youtube": "configured",
            "songKeys": "not-configured",
        }
    with make_client(youtube_api_key="") as c:
        assert c.get("/health").json()["youtube"] == "not-configured"


def test_categories(make_client):
    with make_client() as c:
        cats = c.get("/v1/videos/categories").json()["categories"]
        ids = [x["id"] for x in cats]
        assert "scales" in ids and "number-system" in ids
        assert all(x["difficulty"] in ("beginner", "experienced") for x in cats)


@respx.mock
def test_search_returns_mapped_results_in_relevance_order(make_client):
    search = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=search_payload(["b", "a"], "NEXT")))
    respx.get(VIDEOS_URL).mock(return_value=httpx.Response(200, json=videos_payload(["a", "b"])))
    with make_client() as c:
        r = c.get("/v1/videos/search", params={"category": "scales", "difficulty": "beginner"})
    assert r.status_code == 200
    body = r.json()
    assert [v["id"] for v in body["results"]] == ["b", "a"]
    first = body["results"][0]
    assert first == {
        "id": "b",
        "title": "Lesson & b",
        "channel": "Keys Academy",
        "durationSeconds": 725,
        "difficulty": "beginner",
        "watchUrl": "https://www.youtube.com/watch?v=b",
        "thumbnailUrl": "https://i.ytimg.com/b.jpg",
        "attribution": "Keys Academy on YouTube",
    }
    assert body["nextPageToken"] == "NEXT"
    sent = search.calls.last.request.url.params
    assert sent["safeSearch"] == "strict"
    assert sent["videoEmbeddable"] == "true"
    assert sent["key"] == "test-key"
    assert "beginner" in sent["q"]


@respx.mock
def test_results_are_cached(make_client):
    search = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=search_payload(["a"])))
    respx.get(VIDEOS_URL).mock(return_value=httpx.Response(200, json=videos_payload(["a"])))
    with make_client() as c:
        first = c.get("/v1/videos/search", params={"q": "worship chords"}).json()
        second = c.get("/v1/videos/search", params={"q": "worship  chords"}).json()
    assert first["cached"] is False
    assert second["cached"] is True
    assert search.call_count == 1


def test_not_configured_is_explicit(make_client):
    with make_client(youtube_api_key="") as c:
        r = c.get("/v1/videos/search", params={"q": "scales"})
    assert r.status_code == 503
    assert r.json()["reason"] == "not-configured"


@respx.mock
def test_quota_exceeded_becomes_provider_error(make_client):
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(403, json={"error": {"message": "quota", "errors": [{"reason": "quotaExceeded"}]}})
    )
    with make_client() as c:
        r = c.get("/v1/videos/search", params={"q": "scales"})
    assert r.status_code == 503
    assert r.json()["reason"] == "provider-error"
    assert "quota" in r.json()["message"].lower()


@respx.mock
def test_network_failure_becomes_network_error(make_client):
    respx.get(SEARCH_URL).mock(side_effect=httpx.ConnectError("down"))
    with make_client() as c:
        r = c.get("/v1/videos/search", params={"q": "scales"})
    assert r.status_code == 502
    assert r.json()["reason"] == "network"


def test_validation(make_client):
    with make_client() as c:
        assert c.get("/v1/videos/search").json()["reason"] == "invalid-request"
        assert c.get("/v1/videos/search", params={"q": "!!!"}).json()["reason"] == "invalid-request"
        assert c.get("/v1/videos/search", params={"category": "nope"}).status_code == 400
        assert c.get("/v1/videos/search", params={"q": "x", "difficulty": "expert"}).status_code == 422


@respx.mock
def test_rate_limit(make_client):
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=search_payload([])))
    with make_client(rate_limit_per_minute=2) as c:
        codes = [c.get("/v1/videos/search", params={"q": f"scales {i}"}).status_code for i in range(3)]
    assert codes == [200, 200, 429]


@respx.mock
def test_videos_removed_between_calls_are_skipped(make_client):
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=search_payload(["a", "gone"])))
    respx.get(VIDEOS_URL).mock(return_value=httpx.Response(200, json=videos_payload(["a"])))
    with make_client() as c:
        body = c.get("/v1/videos/search", params={"q": "chords"}).json()
    assert [v["id"] for v in body["results"]] == ["a"]


def test_duration_parsing():
    assert parse_iso8601_duration("PT1H2M3S") == 3723
    assert parse_iso8601_duration("PT45S") == 45
    assert parse_iso8601_duration("P1DT1S") == 86401
    assert parse_iso8601_duration("P0D") is None
    assert parse_iso8601_duration("garbage") is None
    assert parse_iso8601_duration(None) is None


def test_query_building_and_cleaning():
    assert clean_query("  C#  major <script> ") == "C# major script"
    q = build_query("F♯ minor", None, "experienced")
    assert "F♯ minor" in q and "piano keyboard" in q and "intermediate advanced" in q and q.endswith("tutorial")
    assert build_query(None, "scales", None).startswith("piano major minor scales")


def test_rate_limiter_window():
    t = [0.0]
    rl = RateLimiter(2, 60, clock=lambda: t[0])
    assert rl.allow("a") and rl.allow("a") and not rl.allow("a")
    assert rl.allow("b")
    t[0] = 61
    assert rl.allow("a")
