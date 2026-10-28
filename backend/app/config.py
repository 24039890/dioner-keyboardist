"""Runtime configuration, read from environment variables (or backend/.env locally)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    youtube_api_key: str = Field(default="", description="YouTube Data API v3 key. Server-side only.")
    getsongbpm_api_key: str = Field(default="", description="GetSongBPM API key (song keys). Server-side only.")
    allowed_origins: str = Field(default="http://localhost:8081")
    rate_limit_per_minute: int = Field(default=30, ge=1, le=1000)
    trust_proxy: bool = False
    cache_ttl_seconds: int = Field(default=6 * 60 * 60, ge=60)
    cache_max_entries: int = Field(default=500, ge=10)
    youtube_timeout_seconds: float = Field(default=8.0, gt=0)

    @property
    def youtube_configured(self) -> bool:
        return bool(self.youtube_api_key.strip())

    @property
    def songkeys_configured(self) -> bool:
        return bool(self.getsongbpm_api_key.strip())

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
