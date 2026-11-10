"""MIRAGE 2.6 robustness research. Read-only; never changes trading state."""
from __future__ import annotations
from math import isfinite
from statistics import median
from app.research_engine import (
    CANDIDATES, LABELS, FEE_RATE, SLIPPAGE_RATE,
    _clean, _prepare, _simulate,
)

MIN_CANDLES = 240
MIN_VALIDATION_TRADES = 30


def run_robustness(candles, *, fee_rate=FEE_RATE, slippage_rate=SLIPPAGE_RATE):
    if not (isfinite(fee_rate) and isfinite(slippage_rate)
            and 0 <= fee_rate < 0.1 and 0 <= slippage_rate < 0.1):
        raise ValueError("Execution costs must be finite and between 0 and 10% per side")
    rows = _clean(candles)
    if len(rows) < MIN_CANDLES:
        return {"status": "insufficient_data", "candles": len(rows),
                "minimum_candles": MIN_CANDLES, "families": [],
                "warning": "Research only. No Paper Trading settings are changed."}

    first_train = max(150, int(len(rows) * 0.55))
    fold_size = (len(rows) - first_train) // 3
    if fold_size < 20:
        return {"status": "insufficient_data", "candles": len(rows),
                "minimum_candles": MIN_CANDLES, "families": []}

    stress_fee = max(fee_rate, min(fee_rate * 1.5, 0.099))
    stress_slippage = max(slippage_rate, min(slippage_rate * 2.0, 0.099))
    output = []

    for family, candidates in CANDIDATES.items():
        prepared = [(params, _prepare(rows, family, params)) for params in candidates]
        folds, selected, validation_returns, stress_returns = [], [], [], []
        validation_trades = 0
        for fold in range(3):
            start = first_train + fold * fold_size
            end = len(rows) if fold == 2 else start + fold_size
            train_scores = []
            for params, indicators in prepared:
                metrics = _simulate(rows, family, params, 50, start,
                                    fee_rate, slippage_rate, indicators)
                score = metrics["return_pct"] - 0.5 * metrics["max_drawdown_pct"]
                if metrics["trades"] < 3:
                    score -= 5.0
                train_scores.append((score, params, indicators, metrics))
            _, chosen, chosen_indicators, train_metrics = max(train_scores, key=lambda x: x[0])
            base = _simulate(rows, family, chosen, start, end,
                             fee_rate, slippage_rate, chosen_indicators)
            stress = _simulate(rows, family, chosen, start, end,
                               stress_fee, stress_slippage, chosen_indicators)
            validation_returns.append(base["return_pct"])
            stress_returns.append(stress["return_pct"])
            validation_trades += base["trades"]
            selected.append(tuple(sorted(chosen.items())))

            # Parameter sensitivity: every predeclared variant is evaluated on
            # the same unseen fold; it is not used to select the fold winner.
            variant_results = []
            for params, indicators in prepared:
                vm = _simulate(rows, family, params, start, end,
                               fee_rate, slippage_rate, indicators)
                variant_results.append({"parameters": params,
                                        "return_pct": round(vm["return_pct"], 3),
                                        "positive": vm["return_pct"] > 0})
            folds.append({
                "fold": fold + 1,
                "training_candles": start - 50,
                "validation_candles": end - start,
                "selected_parameters": chosen,
                "training_return_pct": round(train_metrics["return_pct"], 3),
                "validation_return_pct": round(base["return_pct"], 3),
                "validation_drawdown_pct": round(base["max_drawdown_pct"], 3),
                "validation_trades": base["trades"],
                "stress_return_pct": round(stress["return_pct"], 3),
                "stress_drawdown_pct": round(stress["max_drawdown_pct"], 3),
                "stress_trades": stress["trades"],
                "parameter_variants": variant_results,
            })

        positive = sum(x > 0 for x in validation_returns)
        stress_positive = sum(x > 0 for x in stress_returns)
        all_variants = [v for f in folds for v in f["parameter_variants"]]
        variant_positive_pct = (100 * sum(v["positive"] for v in all_variants) / len(all_variants)) if all_variants else 0
        stable = len(set(selected)) == 1
        if validation_trades < MIN_VALIDATION_TRADES:
            status = "insufficient_trades"
        elif positive == 3 and stress_positive >= 2 and variant_positive_pct >= 50:
            status = "robust_candidate_unconfirmed"
        elif positive >= 2 and stress_positive >= 1:
            status = "mixed_robustness"
        else:
            status = "fragile_or_not_validated"
        output.append({
            "id": family, "name": LABELS[family],
            "median_validation_return_pct": round(median(validation_returns), 3),
            "median_stress_return_pct": round(median(stress_returns), 3),
            "positive_folds": positive, "stress_positive_folds": stress_positive,
            "validation_trades": validation_trades,
            "parameter_stability": "stable" if stable else "varied",
            "positive_parameter_variants_pct": round(variant_positive_pct, 1),
            "status": status, "folds": folds,
        })

    priority = {"robust_candidate_unconfirmed": 3, "mixed_robustness": 2,
                "fragile_or_not_validated": 1, "insufficient_trades": 0}
    output.sort(key=lambda x: (priority[x["status"]], x["stress_positive_folds"],
                               x["positive_folds"], x["median_stress_return_pct"]), reverse=True)
    for rank, item in enumerate(output, 1):
        item["rank"] = rank
    return {
        "status": "ok", "candles": len(rows), "folds": 3,
        "stress_assumptions": {"fee_per_side_pct": round(stress_fee * 100, 4),
                               "slippage_per_side_pct": round(stress_slippage * 100, 4),
                               "fee_multiplier": 1.5, "slippage_multiplier": 2.0},
        "families": output,
        "warning": ("Research only; not a profitability guarantee or strategy approval. "
                    "Stress tests use higher modeled fees/slippage. OHLCV does not model "
                    "spread, funding, partial fills or intrabar execution. No result changes "
                    "Paper Trading balances, positions, history or settings."),
    }
