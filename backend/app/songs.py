"""Song-key search: find a song by title and return the key it is published in."""

from typing import Annotated

from cachetools import TTLCache
from fastapi import APIRouter, Depends, Query, Request

from .config import Settings, get_settings
from .ratelimit import RateLimiter
from .schemas import ErrorResponse, SongKey, SongKeyResult, SongSearchResponse
from .songkeys import SOURCE_URL, ProviderError, ProviderUnavailable, RawSong, SongKeyClient
from .videos import clean_query, client_key, error

router = APIRouter(prefix="/v1/songs", tags=["songs"])

MAX_RESULTS = 15
ATTRIBUTION = "Song keys from GetSongBPM.com"


def to_result(s: RawSong) -> SongKeyResult:
    return SongKeyResult(
        id=s.id,
        title=s.title,
        artist=s.artist,
        album=s.album,
        year=s.year,
        key=SongKey(tonic=s.tonic, mode=s.mode) if s.tonic is not None and s.mode else None,
        tempo=s.tempo,
        source_url=s.url or SOURCE_URL,
    )


@router.get(
    "/search",
    response_model=SongSearchResponse,
    response_model_by_alias=True,
    responses={
        400: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def search(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    q: Annotated[str | None, Query(max_length=200)] = None,
):
    limiter: RateLimiter = request.app.state.limiter
    if not limiter.allow(client_key(request, settings)):
        return error(429, "rate-limited", "Too many searches. Wait a minute and try again.")
    query = clean_query(q or "")
    if len(query) < 2:
        return error(400, "invalid-request", "Type at least two letters of the song title.")
    if not settings.songkeys_configured:
        return error(503, "not-configured", "Song search is not configured on the server (missing GETSONGBPM_API_KEY).")

    cache: TTLCache = request.app.state.song_cache
    key = query.lower()
    if key in cache:
        cached: SongSearchResponse = cache[key]
        return cached.model_copy(update={"cached": True})

    client = SongKeyClient(settings.getsongbpm_api_key, request.app.state.http)
    try:
        songs = await client.search(query)
    except ProviderUnavailable as exc:
        return error(502, "network", str(exc))
    except ProviderError as exc:
        return error(503, "provider-error", str(exc))

    response = SongSearchResponse(
        results=[to_result(s) for s in songs[:MAX_RESULTS]], attribution=ATTRIBUTION, source_url=SOURCE_URL
    )
    cache[key] = response
    return response
