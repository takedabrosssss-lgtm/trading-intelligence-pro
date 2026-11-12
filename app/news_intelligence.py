"""Read-only market news aggregation from public RSS feeds.

The impact labels are transparent keyword heuristics, not predictive signals.
This module does not write to the database or interact with Paper Trading.
"""
from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

import httpx

logger = logging.getLogger("mirage.news")

SOURCES = (
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Bitcoin Magazine", "https://bitcoinmagazine.com/feed"),
    ("Decrypt", "https://decrypt.co/feed"),
)
CACHE_SECONDS = 600
_MAX_FEED_BYTES = 2_000_000
_CACHE: dict[str, Any] = {"expires": 0.0, "items": [], "sources": []}
_CACHE_LOCK = asyncio.Lock()

_TAG_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")
_ASSET_PATTERNS = (
    ("BTC", re.compile(r"\b(bitcoin|btc)\b", re.I)),
    ("ETH", re.compile(r"\b(ethereum|ether|eth)\b", re.I)),
    ("SOL", re.compile(r"\b(solana|sol)\b", re.I)),
    ("BNB", re.compile(r"\b(binance coin|bnb)\b", re.I)),
    ("XRP", re.compile(r"\b(xrp|ripple)\b", re.I)),
    ("ADA", re.compile(r"\b(cardano|ada)\b", re.I)),
    ("DOGE", re.compile(r"\b(dogecoin|doge)\b", re.I)),
)
_HIGH_IMPACT = re.compile(
    r"\b(SEC|ETF|hack|hacked|exploit|lawsuit|ban|approved|approval|rejected|"
    r"regulation|regulator|liquidation|bankruptcy|rate decision|interest rate|"
    r"санкц|взлом|эксплойт|одобр|запрет|регуляц|ликвидац|банкротств)\b", re.I,
)
_MEDIUM_IMPACT = re.compile(
    r"\b(institutional|inflows|outflows|upgrade|launch|partnership|funding|"
    r"adoption|listing|delisting|институцион|приток|отток|обновлен|запуск|"
    r"партнер|листинг|делистинг)\b", re.I,
)
_ECONOMY = re.compile(
    r"\b(fed|federal reserve|inflation|cpi|pce|jobs report|treasury|dollar|"
    r"yield|gdp|recession|макроэконом|инфляц|фрс|федеральн резерв|доходност|"
    r"ввп|рецесс)\b", re.I,
)
_ANALYSIS = re.compile(
    r"\b(analysis|analyst|outlook|forecast|price target|technical|chart|"
    r"анализ|прогноз|техническ|сценарий|перспектив)\b", re.I,
)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(element: ET.Element, names: set[str]) -> str:
    for child in list(element):
        if _local_name(child.tag) in names:
            value = " ".join(part.strip() for part in child.itertext() if part.strip())
            if value:
                return value
    return ""


def _clean_text(value: str, limit: int = 420) -> str:
    value = html.unescape(value or "")
    value = _TAG_RE.sub(" ", value)
    value = _SPACE_RE.sub(" ", value).strip()
    if len(value) > limit:
        value = value[: limit - 1].rstrip() + "…"
    return value


def _published(value: str) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _item_link(element: ET.Element) -> str:
    link = _child_text(element, {"link"})
    if link:
        return link.strip()
    for child in list(element):
        if _local_name(child.tag) == "link":
            href = child.attrib.get("href", "").strip()
            rel = child.attrib.get("rel", "alternate")
            if href and rel in {"alternate", ""}:
                return href
    return ""


def parse_rss(xml_text: str, source: str) -> list[dict[str, Any]]:
    """Parse common RSS 2.0 and Atom entries into safe plain-text records."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        logger.warning("Invalid RSS from %s: %s", source, exc)
        return []

    elements = [node for node in root.iter() if _local_name(node.tag) in {"item", "entry"}]
    results: list[dict[str, Any]] = []
    for element in elements:
        title = _clean_text(_child_text(element, {"title"}), 220)
        summary = _clean_text(_child_text(element, {"description", "summary", "content", "encoded"}), 520)
        link = _item_link(element)
        if not title or not link:
            continue
        parsed_url = urlparse(link)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            continue
        published_raw = _child_text(element, {"pubdate", "published", "updated", "date"})
        published = _published(published_raw)
        haystack = f"{title} {summary}"
        assets = [symbol for symbol, pattern in _ASSET_PATTERNS if pattern.search(haystack)]
        category = "economy" if _ECONOMY.search(haystack) else "analysis" if _ANALYSIS.search(haystack) else "crypto"
        impact = "high" if _HIGH_IMPACT.search(haystack) else "medium" if _MEDIUM_IMPACT.search(haystack) else "low"
        stable_id = hashlib.sha256(link.encode("utf-8")).hexdigest()[:16]
        results.append({
            "id": stable_id,
            "title": title,
            "summary": summary,
            "url": link,
            "source": source,
            "published_at": published,
            "category": category,
            "assets": assets,
            "impact": impact,
            "impact_method": "keyword_heuristic",
        })
    return results


async def _fetch_source(client: httpx.AsyncClient, name: str, url: str) -> tuple[str, list[dict[str, Any]]]:
    try:
        response = await client.get(url, headers={"Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"})
        response.raise_for_status()
        if len(response.content) > _MAX_FEED_BYTES:
            raise ValueError("Feed exceeds size limit")
        return name, parse_rss(response.text, name)
    except Exception as exc:  # one unavailable feed must not block the others
        logger.info("News source %s unavailable: %s", name, exc)
        return name, []


async def get_news(limit: int = 50, force_refresh: bool = False) -> dict[str, Any]:
    limit = max(1, min(int(limit), 100))
    async with _CACHE_LOCK:
        now = time.monotonic()
        if not force_refresh and _CACHE["expires"] > now:
            return {
                "items": _CACHE["items"][:limit],
                "sources": _CACHE["sources"],
                "updated_at": _CACHE.get("updated_at"),
            }
        timeout = httpx.Timeout(8.0, connect=4.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            fetched = await asyncio.gather(*(_fetch_source(client, name, url) for name, url in SOURCES))
        deduped: dict[str, dict[str, Any]] = {}
        source_counts = []
        for name, records in fetched:
            source_counts.append({"name": name, "count": len(records), "available": bool(records)})
            for record in records:
                deduped.setdefault(record["url"], record)
        items = list(deduped.values())
        items.sort(key=lambda item: item.get("published_at") or "", reverse=True)
        updated_at = datetime.now(timezone.utc).isoformat()
        _CACHE.update({"expires": time.monotonic() + CACHE_SECONDS, "items": items, "sources": source_counts, "updated_at": updated_at})
        return {"items": items[:limit], "sources": source_counts, "updated_at": updated_at}
