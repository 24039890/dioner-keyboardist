"""Minimal GetSongBPM client (song search with each song's published key).

Terms: the API is free, but GetSongBPM requires a visible link back to
https://getsongbpm.com from the app or its store listing. The app shows it under
every set of results.
"""

import re
from dataclasses import dataclass

import httpx

API_BASE = "https://api.getsong.co"
SOURCE_URL = "https://getsongbpm.com"

_KEY_RE = re.compile(r"^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(m|min|minor)?\s*$")
_LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


class ProviderError(Exception):
    """GetSongBPM rejected the request (bad key, suspended account, ...)."""


class ProviderUnavailable(Exception):
    """GetSongBPM could not be reached."""


@dataclass(frozen=True)
class RawSong:
    id: str
    title: str
    artist: str
    album: str | None
    year: int | None
    tonic: int | None
    mode: str | None
    tempo: int | None
    url: str | None


def parse_key(value: object) -> tuple[int, str] | None:
    """'Em' -> (4, 'minor'), 'F#' -> (6, 'major'), 'B♭m' -> (10, 'minor'). None if not a key."""
    if not isinstance(value, str):
        return None
    m = _KEY_RE.match(value)
    if not m:
        return None
    letter, accidental, minor = m.groups()
    pc = _LETTER_PC[letter.upper()]
    if accidental in ("#", "♯"):
        pc += 1
    elif accidental in ("b", "♭"):
        pc -= 1
    return pc % 12, "minor" if minor else "major"


def _int(value: object) -> int | None:
    try:
        n = int(float(str(value)))
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def parse_song(item: object) -> RawSong | None:
    if not isinstance(item, dict):
        return None
    song_id = item.get("id")
    title = item.get("title")
    if not song_id or not isinstance(title, str) or not title.strip():
        return None
    artist = item.get("artist") if isinstance(item.get("artist"), dict) else {}
    album = item.get("album") if isinstance(item.get("album"), dict) else {}
    key = parse_key(item.get("key_of"))
    url = item.get("uri")
    return RawSong(
        id=str(song_id),
        title=title.strip(),
        artist=str(artist.get("name") or "").strip(),
        album=str(album.get("title")).strip() if album.get("title") else None,
        year=_int(album.get("year")),
        tonic=key[0] if key else None,
        mode=key[1] if key else None,
        tempo=_int(item.get("tempo")),
        url=url if isinstance(url, str) and url.startswith("https://") else None,
    )


class SongKeyClient:
    def __init__(self, api_key: str, http: httpx.AsyncClient):
        self._key = api_key
        self._http = http

    async def search(self, query: str) -> list[RawSong]:
        try:
            response = await self._http.get(
                f"{API_BASE}/search/", params={"type": "song", "lookup": query}, headers={"X-API-KEY": self._key}
            )
        except httpx.HTTPError as exc:
            raise ProviderUnavailable("The song-key service could not be reached.") from exc
        if response.status_code in (401, 403):
            raise ProviderError(
                "The song-key service key is invalid. The server administrator must update GETSONGBPM_API_KEY."
            )
        if response.status_code != 200:
            raise ProviderError(f"Song-key service error ({response.status_code}).")
        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderError("The song-key service sent an unreadable reply.") from exc
        found = data.get("search") if isinstance(data, dict) else None
        # "No result" comes back as {"search": {"error": "no result"}}.
        if not isinstance(found, list):
            return []
        return [s for s in (parse_song(item) for item in found) if s is not None]
