"""Authenticated, read-only market news endpoint."""
from fastapi import APIRouter, Depends, Query

from app.news_intelligence import get_news


def build_news_router(require_user):
    router = APIRouter(prefix="/api/news", tags=["news"])

    @router.get("")
    async def news(
        limit: int = Query(50, ge=1, le=100),
        refresh: bool = Query(False),
        user=Depends(require_user),
    ):
        return await get_news(limit=limit, force_refresh=refresh)

    return router
