"""API response models. Field names match the app's VideoResult type (camelCase)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Difficulty = Literal["beginner", "experienced"]


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class VideoResult(ApiModel):
    id: str
    title: str
    channel: str
    duration_seconds: int | None = Field(default=None, serialization_alias="durationSeconds")
    difficulty: Difficulty | None = None
    watch_url: str = Field(serialization_alias="watchUrl")
    thumbnail_url: str | None = Field(default=None, serialization_alias="thumbnailUrl")
    attribution: str


class SearchResponse(ApiModel):
    results: list[VideoResult]
    next_page_token: str | None = Field(default=None, serialization_alias="nextPageToken")
    cached: bool = False


class Category(ApiModel):
    id: str
    title: str
    description: str
    difficulty: Difficulty


class CategoriesResponse(ApiModel):
    categories: list[Category]


class ErrorResponse(ApiModel):
    reason: Literal["not-configured", "provider-error", "network", "rate-limited", "invalid-request"]
    message: str


class Health(ApiModel):
    status: Literal["ok"]
    version: str
    youtube: Literal["configured", "not-configured"]
