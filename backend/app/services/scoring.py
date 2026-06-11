def calculate_precursor_score(monthly_counts) -> float:
    score = 0.0
    if not monthly_counts:
        return score
    
    # Assuming monthly_counts is sorted by date ascending
    latest = monthly_counts[-1]
    mom = latest.mom_change_pct if hasattr(latest, 'mom_change_pct') else 0
    
    if mom > 50:
        score += 40
    elif mom > 20:
        score += 25
    elif mom > 0:
        score += 10
        
    if len(monthly_counts) >= 3:
        last3 = monthly_counts[-3:]
        # Check if counts are strictly increasing over last 3 months
        if all(last3[i].count > last3[i-1].count for i in range(1, len(last3))):
            score += 20
            
    return min(score, 100.0)

def calculate_alignment_score(N: int, A: int, E: int, latest_mom_change_pct: float = 0.0) -> dict:
    """
    Calculate alignment score between paper trends and external information.

    Args:
        N: number of news items for the theme
        A: number of announcement items for the theme
        E: number of earnings items for the theme
        latest_mom_change_pct: latest month-over-month change in paper counts

    Returns:
        dict with keys: score, news_score, announcement_score, earnings_score, confidence, evidence_count
    """
    total = N + A + E

    news_score = min(N / 5, 1.0) * 100
    announcement_score = min(A / 3, 1.0) * 100
    earnings_score = min(E / 2, 1.0) * 100

    raw_score = news_score * 0.35 + announcement_score * 0.40 + earnings_score * 0.25

    # Paper trend factor: reward themes where paper count is actively growing
    if latest_mom_change_pct > 20:
        paper_factor = 1.2
    elif latest_mom_change_pct > 0:
        paper_factor = 1.0
    else:
        paper_factor = 0.5

    # Diversity factor: penalize themes with only one type of external evidence
    source_types_present = sum(1 for x in [N, A, E] if x > 0)
    diversity_factor = 1.0 if source_types_present >= 2 else 0.6

    score = min(raw_score * paper_factor * diversity_factor, 100.0)
    confidence = min(total / 5, 1.0)

    return {
        "score": round(score, 2),
        "news_score": round(news_score, 2),
        "announcement_score": round(announcement_score, 2),
        "earnings_score": round(earnings_score, 2),
        "confidence": round(confidence, 2),
        "evidence_count": total,
    }
