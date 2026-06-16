import math
from datetime import date, timedelta
from typing import List, Dict, Any, Tuple

def pearson(xs: List[float], ys: List[float]) -> float:
    """
    Calculate Pearson correlation coefficient using standard library only.
    Returns 0.0 if variance is 0 or count < 2.
    """
    n = len(xs)
    if n < 2:
        return 0.0
    
    mu_x = sum(xs) / n
    mu_y = sum(ys) / n
    
    var_x = sum((x - mu_x) ** 2 for x in xs)
    var_y = sum((y - mu_y) ** 2 for y in ys)
    
    if var_x == 0 or var_y == 0:
        return 0.0
    
    covariance = sum((xs[i] - mu_x) * (ys[i] - mu_y) for i in range(n))
    
    correlation = covariance / math.sqrt(var_x * var_y)
    return round(correlation, 4)

def forward_return_pct(baseline_close: float, target_close: float) -> float:
    """
    Calculate forward return percentage: (target - baseline) / baseline * 100.
    """
    if baseline_close == 0:
        return 0.0
    return round((target_close - baseline_close) / baseline_close * 100, 2)

def get_date_after_days(base_date_str: str, days: int) -> str:
    """
    Helper to add days to an ISO date string.
    """
    base_date = date.fromisoformat(base_date_str)
    target_date = base_date + timedelta(days=days)
    return target_date.isoformat()

def evaluate_signal_alignment(
    companies: List[Dict[str, Any]], 
    price_repo: Any, 
    baseline: str = "2024-01-01", 
    windows: Tuple[int, ...] = (30, 90)
) -> Dict[str, Any]:
    """
    Evaluate how well precursor signals matched subsequent stock-price movement.
    """
    results_by_window = []
    evaluated_companies = []

    # Pre-filter companies with ticker
    valid_companies = [c for c in companies if c.get("ticker")]

    company_evals = []
    for company in valid_companies:
        ticker = company["ticker"]
        benefit_score = company.get("benefit_score", 0.0)
        
        # Baseline price
        baseline_price_data = price_repo.get_price_on_or_after(ticker, baseline)
        if not baseline_price_data:
            continue
            
        baseline_date = baseline_price_data["date"]
        baseline_close = baseline_price_data["close"]
        
        company_window_results = []
        for window_days in windows:
            target_date_requested = get_date_after_days(baseline, window_days)
            target_price_data = price_repo.get_price_on_or_after(ticker, target_date_requested)
            
            if not target_price_data:
                continue
                
            target_date = target_price_data["date"]
            target_close = target_price_data["close"]
            
            forward_return = forward_return_pct(baseline_close, target_close)
            predicted_direction = "up" if benefit_score >= 50 else "down"
            actual_direction = "up" if forward_return > 0 else "down"
            hit = predicted_direction == actual_direction
            
            company_window_results.append({
                "window_days": window_days,
                "baseline_date": baseline_date,
                "baseline_close": baseline_close,
                "target_date": target_date,
                "target_close": target_close,
                "forward_return_pct": forward_return,
                "predicted_direction": predicted_direction,
                "actual_direction": actual_direction,
                "hit": hit
            })
            
        if company_window_results:
            company_evals.append({
                "company_id": company["id"],
                "name": company["name"],
                "ticker": ticker,
                "signal_score": benefit_score,
                "results": company_window_results
            })

    # Summary per window
    for window_days in windows:
        window_companies = []
        for ce in company_evals:
            window_res = next((r for r in ce["results"] if r["window_days"] == window_days), None)
            if window_res:
                window_companies.append({
                    "signal_score": ce["signal_score"],
                    "forward_return_pct": window_res["forward_return_pct"],
                    "hit": window_res["hit"]
                })
        
        count = len(window_companies)
        if count == 0:
            results_by_window.append({
                "window_days": window_days,
                "evaluated_count": 0,
                "direction_hit_rate": 0.0,
                "correlation": 0.0,
                "avg_return_high_signal": 0.0,
                "avg_return_low_signal": 0.0
            })
            continue
            
        hits = sum(1 for c in window_companies if c["hit"])
        hit_rate = round(hits / count, 4)
        
        scores = [c["signal_score"] for c in window_companies]
        returns = [c["forward_return_pct"] for c in window_companies]
        correlation = pearson(scores, returns)
        
        high_signals = [c["forward_return_pct"] for c in window_companies if c["signal_score"] >= 50]
        low_signals = [c["forward_return_pct"] for c in window_companies if c["signal_score"] < 50]
        
        avg_high = round(sum(high_signals) / len(high_signals), 2) if high_signals else 0.0
        avg_low = round(sum(low_signals) / len(low_signals), 2) if low_signals else 0.0
        
        results_by_window.append({
            "window_days": window_days,
            "evaluated_count": count,
            "direction_hit_rate": hit_rate,
            "correlation": correlation,
            "avg_return_high_signal": avg_high,
            "avg_return_low_signal": avg_low
        })

    return {
        "baseline": baseline,
        "summary": {
            "baseline": baseline,
            "windows": results_by_window
        },
        "companies": company_evals
    }
