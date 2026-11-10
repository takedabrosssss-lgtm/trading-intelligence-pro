"""Cross-asset aggregation for read-only MIRAGE research."""
from __future__ import annotations
from statistics import median
from typing import Any


def _number(value: Any) -> float | None:
    try:
        if value in (None, "inf", "-inf"):
            return None
        number = float(value)
        return number if number == number and abs(number) != float("inf") else None
    except (TypeError, ValueError):
        return None


def aggregate_cross_asset(results: list[dict[str, Any]], requested_symbols: list[str]) -> dict[str, Any]:
    """Summarize independent per-asset walk-forward results without pooling returns."""
    valid = [r for r in results if r.get("status") == "ok"]
    by_family: dict[str, list[dict[str, Any]]] = {}
    for result in valid:
        for family in result.get("families", []):
            by_family.setdefault(str(family.get("id")), []).append({"symbol": result["symbol"], **family})

    summaries = []
    for family_id, entries in by_family.items():
        returns = [v for v in (_number(x.get("out_of_sample_return_pct")) for x in entries) if v is not None]
        drawdowns = [v for v in (_number(x.get("max_fold_drawdown_pct")) for x in entries) if v is not None]
        pfs = [v for v in (_number(x.get("profit_factor")) for x in entries) if v is not None]
        symbols_positive = [x["symbol"] for x in entries if (_number(x.get("out_of_sample_return_pct")) or 0) > 0]
        total_trades = sum(int(x.get("validation_trades") or 0) for x in entries)
        summaries.append({
            "id": family_id,
            "name": entries[0].get("name", family_id),
            "assets_tested": len(returns),
            "positive_assets": len(symbols_positive),
            "positive_symbols": symbols_positive,
            "median_oos_return_pct": round(median(returns), 3) if returns else None,
            "median_max_fold_drawdown_pct": round(median(drawdowns), 3) if drawdowns else None,
            "worst_max_fold_drawdown_pct": round(max(drawdowns), 3) if drawdowns else None,
            "median_profit_factor": round(median(pfs), 3) if pfs else None,
            "total_validation_trades": total_trades,
            "per_asset": [{
                "symbol": x["symbol"],
                "oos_return_pct": x.get("out_of_sample_return_pct"),
                "max_fold_drawdown_pct": x.get("max_fold_drawdown_pct"),
                "trades": x.get("validation_trades", 0),
                "positive_folds": x.get("positive_folds", 0),
                "parameter_stability": x.get("parameter_stability"),
            } for x in entries],
        })

    summaries.sort(key=lambda x: (
        x["positive_assets"],
        x["median_oos_return_pct"] if x["median_oos_return_pct"] is not None else -1e9,
        -(x["median_max_fold_drawdown_pct"] or 0),
    ), reverse=True)
    for rank, item in enumerate(summaries, 1):
        item["rank"] = rank
        # This is deliberately a conservative research label, not an approval.
        item["research_status"] = (
            "cross_asset_candidate_unconfirmed"
            if item["assets_tested"] >= 4 and item["positive_assets"] >= 4
            and item["total_validation_trades"] >= 60
            else "not_validated"
        )

    return {
        "status": "ok" if len(valid) >= 3 else "insufficient_data",
        "requested_symbols": requested_symbols,
        "successful_symbols": [r["symbol"] for r in valid],
        "failed_symbols": [r["symbol"] for r in results if r.get("status") != "ok"],
        "assets_available": len(valid),
        "assets_required": 3,
        "families": summaries,
        "method": "Independent walk-forward run per asset; cross-asset median and positive-asset count. Returns are not pooled or treated as independent statistical proof.",
        "warning": "Research only. A cross-asset result is not a profitability guarantee. Samples may overlap in time, assets are correlated, and low trade counts are not statistically validated. No result changes Paper Trading settings.",
    }
