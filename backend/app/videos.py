"""Video tutorial endpoints: curated categories and cached search."""

import html
import re
from typing import Annotated

from cachetools import TTLCache
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .ratelimit import RateLimiter
from .schemas import CategoriesResponse, Category, Difficulty, ErrorResponse, SearchResponse, VideoResult
from .youtube import ProviderError, ProviderUnavailable, RawVideo, YouTubeClient

router = APIRouter(prefix="/v1/videos", tags=["videos"])

# Curated categories aligned with the app's lessons. The query text is what is sent to YouTube.
CATEGORIES: dict[str, tuple[Category, str]] = {
    c.id: (c, q)
    for c, q in [
        (
            Category(
                id="keyboard-basics",
                title="Keyboard basics",
                description="Finding notes, posture, first steps.",
                difficulty="beginner",
            ),
            "piano keyboard basics note names lesson",
        ),
        (
            Category(
                id="scales", title="Scales", description="Major and minor scales with fingering.", difficulty="beginner"
            ),
            "piano major minor scales fingering lesson",
        ),
        (
            Category(
                id="chords", title="Chords", description="Major, minor and seventh chords.", difficulty="beginner"
            ),
            "piano chords major minor seventh lesson",
        ),
        (
            Category(
                id="number-system",
                title="Number system",
                description="Nashville numbers and playing in any key.",
                difficulty="experienced",
            ),
            "nashville number system keyboard lesson",
        ),
        (
            Category(
                id="transposition",
                title="Transposition",
                description="Moving songs to a singer's key.",
                difficulty="experienced",
            ),
            "how to transpose chords piano lesson",
        ),
        (
            Category(
                id="worship-accompaniment",
                title="Worship accompaniment",
                description="Accompanying a singer or congregation.",
                difficulty="experienced",
            ),
            "worship keyboard accompaniment tutorial",
        ),
        (
            Category(
                id="playing-by-ear",
                title="Playing by ear",
                description="Hearing chords and keys.",
                difficulty="experienced",
            ),
            "play piano by ear chord progressions lesson",
        ),
    ]
}

PAGE_SIZE = 12
_QUERY_SAFE = re.compile(r"[^\w\s#♯♭'&+-]", re.UNICODE)


def clean_query(q: str) -> str:
    """Trims, collapses whitespace and strips characters that are never useful in a music search."""
    return re.sub(r"\s+", " ", _QUERY_SAFE.sub(" ", q)).strip()[:80]


def build_query(q: str | None, category: str | None, difficulty: Difficulty | None) -> str:
    parts: list[str] = []
    if category:
        parts.append(CATEGORIES[category][1])
    if q:
        parts.append(clean_query(q))
    if not any(p.lower().find("piano") >= 0 or p.lower().find("keyboard") >= 0 for p in parts):
        parts.append("piano keyboard")
    if difficulty == "beginner":
        parts.append("beginner")
    elif difficulty == "experienced":
        parts.append("intermediate advanced")
    parts.append("tutorial")
    return " ".join(parts)


def to_result(v: RawVideo, difficulty: Difficulty | None) -> VideoResult:
    return VideoResult(
        id=v.id,
        title=html.unescape(v.title),
        channel=html.unescape(v.channel),
        duration_seconds=v.duration_seconds,
        difficulty=difficulty,
        watch_url=f"https://www.youtube.com/watch?v={v.id}",
        thumbnail_url=v.thumbnail_url,
        attribution=f"{html.unescape(v.channel)} on YouTube",
    )


def error(status: int, reason: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content=ErrorResponse(reason=reason, message=message).model_dump())


@router.get("/categories", response_model=CategoriesResponse)
async def categories() -> CategoriesResponse:
    return CategoriesResponse(categories=[c for c, _ in CATEGORIES.values()])


@router.get(
    "/search",
    response_model=SearchResponse,
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
    category: str | None = None,
    difficulty: Difficulty | None = None,
    page_token: Annotated[str | None, Query(alias="pageToken", max_length=200)] = None,
):
    limiter: RateLimiter = request.app.state.limiter
    if not limiter.allow(client_key(request, settings)):
        return error(429, "rate-limited", "Too many searches. Wait a minute and try again.")
    if category is not None and category not in CATEGORIES:
        return error(400, "invalid-request", f"Unknown category '{category}'.")
    if not (q and clean_query(q)) and not category:
        return error(400, "invalid-request", "Enter a search term or choose a category.")
    if not settings.youtube_configured:
        return error(
            503, "not-configured", "Video tutorials are not configured on the server (missing YOUTUBE_API_KEY)."
        )

    query = build_query(q, category, difficulty)
    cache: TTLCache = request.app.state.video_cache
    key = (query, page_token or "")
    if key in cache:
        cached: SearchResponse = cache[key]
        return cached.model_copy(update={"cached": True})

    client = YouTubeClient(settings.youtube_api_key, request.app.state.http)
    try:
        videos, next_token = await client.search(query, PAGE_SIZE, page_token)
    except ProviderUnavailable as exc:
        return error(502, "network", str(exc))
    except ProviderError as exc:
        return error(503, "provider-error", str(exc))

    response = SearchResponse(results=[to_result(v, difficulty) for v in videos], next_page_token=next_token)
    cache[key] = response
    return response


def client_key(request: Request, settings: Settings) -> str:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
