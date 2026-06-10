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
