"""Minimal YouTube Data API v3 client (search.list + videos.list).

Quota: a search costs 100 units and a videos.list call 1 unit (10,000 units/day on
the default quota), so results are cached by the caller.
"""

import re
from dataclasses import dataclass

import httpx

API_BASE = "https://www.googleapis.com/youtube/v3"
_DURATION_RE = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")


class ProviderError(Exception):
    """YouTube rejected the request (quota, bad key, ...)."""


class ProviderUnavailable(Exception):
    """YouTube could not be reached."""


@dataclass(frozen=True)
class RawVideo:
    id: str
    title: str
    channel: str
    thumbnail_url: str | None
    duration_seconds: int | None


def parse_iso8601_duration(value: str | None) -> int | None:
    """'PT1H2M3S' -> 3723. Returns None for missing or unparseable values (e.g. live streams 'P0D')."""
    if not value:
        return None
    m = _DURATION_RE.match(value)
    if not m or not any(m.groups()):
        return None
    days, hours, minutes, seconds = (int(g) if g else 0 for g in m.groups())
    total = days * 86400 + hours * 3600 + minutes * 60 + seconds
    return total or None


def _error_message(response: httpx.Response) -> str:
    try:
        err = response.json().get("error", {})
        reasons = [e.get("reason") for e in err.get("errors", []) if e.get("reason")]
        if "quotaExceeded" in reasons or "dailyLimitExceeded" in reasons:
            return "The daily video search quota has been reached. Try again tomorrow."
        if "keyInvalid" in reasons or response.status_code in (400, 403) and "API key" in str(err.get("message", "")):
            return "The video service key is invalid. The server administrator must update YOUTUBE_API_KEY."
        return str(err.get("message") or f"Video service error ({response.status_code}).")
    except ValueError:
        return f"Video service error ({response.status_code})."


class YouTubeClient:
    def __init__(self, api_key: str, http: httpx.AsyncClient):
        self._key = api_key
        self._http = http

    async def _get(self, path: str, params: dict[str, str | int]) -> dict:
        try:
            response = await self._http.get(f"{API_BASE}/{path}", params={**params, "key": self._key})
        except httpx.HTTPError as exc:
            raise ProviderUnavailable("The video service could not be reached.") from exc
        if response.status_code != 200:
            raise ProviderError(_error_message(response))
        return response.json()

    async def search(self, query: str, max_results: int, page_token: str | None) -> tuple[list[RawVideo], str | None]:
        params: dict[str, str | int] = {
            "part": "snippet",
            "type": "video",
            "q": query,
            "maxResults": max_results,
            "safeSearch": "strict",
            "videoEmbeddable": "true",
            "relevanceLanguage": "en",
        }
        if page_token:
            params["pageToken"] = page_token
        data = await self._get("search", params)
        ids = [item["id"]["videoId"] for item in data.get("items", []) if item.get("id", {}).get("videoId")]
        if not ids:
            return [], data.get("nextPageToken")
        details = await self._get("videos", {"part": "snippet,contentDetails", "id": ",".join(ids)})
        by_id = {item["id"]: item for item in details.get("items", [])}
        videos: list[RawVideo] = []
        for vid in ids:  # keep search relevance order
            item = by_id.get(vid)
            if not item:
                continue  # removed or private since the search
            snippet = item.get("snippet", {})
            thumbs = snippet.get("thumbnails", {})
            thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url")
            videos.append(
                RawVideo(
                    id=vid,
                    title=snippet.get("title", ""),
                    channel=snippet.get("channelTitle", ""),
                    thumbnail_url=thumb,
                    duration_seconds=parse_iso8601_duration(item.get("contentDetails", {}).get("duration")),
                )
            )
        return videos, data.get("nextPageToken")
