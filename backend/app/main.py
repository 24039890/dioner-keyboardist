"""DIONER Keyboardist backend.

Scope: video tutorial search for the Learn tab, proxied to the YouTube Data API so
the API key never ships inside the mobile app. Accounts, user data and files stay
in Supabase.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from cachetools import TTLCache
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import Settings, get_settings
from .ratelimit import RateLimiter
from .schemas import Health
from .videos import router as videos_router


def create_app(settings: Settings | None = None, http: httpx.AsyncClient | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = http or httpx.AsyncClient(timeout=settings.youtube_timeout_seconds)
        app.state.http = client
        try:
            yield
        finally:
            if http is None:
                await client.aclose()

    app = FastAPI(title="DIONER Keyboardist API", version=__version__, lifespan=lifespan)
    app.state.limiter = RateLimiter(settings.rate_limit_per_minute)
    app.state.video_cache = TTLCache(maxsize=settings.cache_max_entries, ttl=settings.cache_ttl_seconds)
    app.dependency_overrides[get_settings] = lambda: settings
    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["GET"], allow_headers=["*"])

    @app.get("/health", response_model=Health)
    async def health() -> Health:
        youtube = "configured" if settings.youtube_configured else "not-configured"
        return Health(status="ok", version=__version__, youtube=youtube)

    app.include_router(videos_router)
    return app


app = create_app()
