from app.services.scoring import calculate_precursor_score, calculate_alignment_score

class MockMonthlyCount:
    def __init__(self, count, mom_change_pct=0.0):
        self.count = count
        self.mom_change_pct = mom_change_pct

def test_calculate_precursor_score_empty():
    assert calculate_precursor_score([]) == 0.0

def test_calculate_precursor_score_mom_high():
    counts = [MockMonthlyCount(10, 60.0)]
    # score = 40 (mom > 50)
    assert calculate_precursor_score(counts) == 40.0

def test_calculate_precursor_score_mom_medium():
    counts = [MockMonthlyCount(10, 25.0)]
    # score = 25 (mom > 20)
    assert calculate_precursor_score(counts) == 25.0

def test_calculate_precursor_score_trend():
    counts = [
        MockMonthlyCount(10, 0.0),
        MockMonthlyCount(15, 50.0),
        MockMonthlyCount(20, 33.3)
    ]
    # mom = 33.3 (> 20) -> 25
    # trend strictly increasing (10 < 15 < 20) -> +20
    # total = 45
    assert calculate_precursor_score(counts) == 45.0

def test_calculate_alignment_score():
    # N=5, A=3, E=2, mom=25
    # news_score = min(5/5, 1.0) * 100 = 100
    # announcement_score = min(3/3, 1.0) * 100 = 100
    # earnings_score = min(2/2, 1.0) * 100 = 100
    # raw_score = 100 * 0.35 + 100 * 0.40 + 100 * 0.25 = 100
    # paper_factor = 1.2 (mom > 20)
    # diversity_factor = 1.0 (source_types >= 2)
    # score = min(100 * 1.2 * 1.0, 100.0) = 100.0
    
    result = calculate_alignment_score(5, 3, 2, 25.0)
    assert result["score"] == 100.0
    assert result["news_score"] == 100.0
    assert result["evidence_count"] == 10

def test_calculate_alignment_score_low_diversity():
    # N=5, A=0, E=0, mom=0
    # news_score = 100, others = 0
    # raw_score = 35
    # paper_factor = 0.5 (mom <= 0)
    # diversity_factor = 0.6 (source_types = 1)
    # score = 35 * 0.5 * 0.6 = 10.5
    result = calculate_alignment_score(5, 0, 0, 0.0)
    assert result["score"] == 10.5
    assert result["confidence"] == 1.0 # total / 5
