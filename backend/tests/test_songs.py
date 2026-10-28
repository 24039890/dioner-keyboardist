"""Song-key search tests. GetSongBPM is mocked with respx; no real API key or network is used."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.songkeys import API_BASE, parse_key

SEARCH_URL = f"{API_BASE}/search/"


def song(i, key_of="Em", tempo="68"):
    return {
        "id": f"s{i}",
        "title": f"Way Maker {i}",
        "uri": f"https://getsongbpm.com/song/way-maker/s{i}",
        "artist": {"id": "a1", "name": "Sinach"},
        "album": {"title": "Way Maker", "year": "2016"},
        "tempo": tempo,
        "key_of": key_of,
    }


@pytest.fixture
def make_client():
    def _make(**overrides):
        values = {"getsongbpm_api_key": "test-key", "rate_limit_per_minute": 100, **overrides}
        settings = Settings(_env_file=None, **values)
        return TestClient(create_app(settings, http=httpx.AsyncClient()))

    return _make


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Em", (4, "minor")),
        ("E", (4, "major")),
        ("F#", (6, "major")),
        ("C♯m", (1, "minor")),
        ("Bb", (10, "major")),
        ("B♭m", (10, "minor")),
        ("Cb", (11, "major")),
        ("", None),
        ("H", None),
        (None, None),
        ("Em7", None),
    ],
)
def test_parse_key(raw, expected):
    assert parse_key(raw) == expected


@respx.mock
def test_search_returns_songs_with_keys(make_client):
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"search": [song(1), song(2, "C#")]}))
    with make_client() as c:
        body = c.get("/v1/songs/search", params={"q": "way maker"}).json()
    assert route.calls[0].request.headers["X-API-KEY"] == "test-key"
    assert route.calls[0].request.url.params["lookup"] == "way maker"
    assert "test-key" not in str(body)
    first = body["results"][0]
    assert first == {
        "id": "s1",
        "title": "Way Maker 1",
        "artist": "Sinach",
        "album": "Way Maker",
        "year": 2016,
        "key": {"tonic": 4, "mode": "minor"},
        "tempo": 68,
        "sourceUrl": "https://getsongbpm.com/song/way-maker/s1",
    }
    assert body["results"][1]["key"] == {"tonic": 1, "mode": "major"}
    assert body["attribution"] == "Song keys from GetSongBPM.com"
    assert body["sourceUrl"] == "https://getsongbpm.com"
    assert body["cached"] is False


@respx.mock
def test_missing_or_odd_fields_are_tolerated(make_client):
    payload = {"search": [song(1, key_of=""), {"id": "x"}, "junk", {**song(3), "uri": "javascript:alert(1)"}]}
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
    with make_client() as c:
        results = c.get("/v1/songs/search", params={"q": "way"}).json()["results"]
    assert [r["id"] for r in results] == ["s1", "s3"]
    assert results[0]["key"] is None
    assert results[1]["sourceUrl"] == "https://getsongbpm.com"


@respx.mock
def test_no_result_is_an_empty_list(make_client):
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"search": {"error": "no result"}}))
    with make_client() as c:
        r = c.get("/v1/songs/search", params={"q": "zzzz"})
    assert r.status_code == 200
    assert r.json()["results"] == []


@respx.mock
def test_results_are_cached(make_client):
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"search": [song(1)]}))
    with make_client() as c:
        assert c.get("/v1/songs/search", params={"q": "Way Maker"}).json()["cached"] is False
        assert c.get("/v1/songs/search", params={"q": "way maker"}).json()["cached"] is True
    assert route.call_count == 1


def test_validation_and_configuration(make_client):
    with make_client() as c:
        r = c.get("/v1/songs/search", params={"q": "a"})
        assert r.status_code == 400 and r.json()["reason"] == "invalid-request"
    with make_client(getsongbpm_api_key="") as c:
        r = c.get("/v1/songs/search", params={"q": "way maker"})
        assert r.status_code == 503 and r.json()["reason"] == "not-configured"


@respx.mock
def test_provider_failures(make_client):
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(403, json={"error": "bad key"}))
    with make_client() as c:
        r = c.get("/v1/songs/search", params={"q": "way maker"})
        assert r.status_code == 503 and r.json()["reason"] == "provider-error"
        assert "GETSONGBPM_API_KEY" in r.json()["message"]
    respx.get(SEARCH_URL).mock(side_effect=httpx.ConnectError("down"))
    with make_client() as c:
        r = c.get("/v1/songs/search", params={"q": "other song"})
        assert r.status_code == 502 and r.json()["reason"] == "network"


@respx.mock
def test_rate_limit(make_client):
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"search": []}))
    with make_client(rate_limit_per_minute=2) as c:
        codes = [c.get("/v1/songs/search", params={"q": f"song {i}"}).status_code for i in range(3)]
    assert codes == [200, 200, 429]
