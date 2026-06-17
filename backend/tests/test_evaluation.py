from app.services.evaluation import pearson, forward_return_pct, get_date_after_days, evaluate_signal_alignment

def test_pearson():
    assert pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]) == 1.0
    assert pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]) == -1.0
    assert pearson([1, 2, 3], [1, 1, 1]) == 0.0
    assert pearson([1], [1]) == 0.0

def test_forward_return_pct():
    assert forward_return_pct(100.0, 110.0) == 10.0
    assert forward_return_pct(100.0, 90.0) == -10.0
    assert forward_return_pct(0.0, 100.0) == 0.0

def test_get_date_after_days():
    assert get_date_after_days("2024-01-01", 10) == "2024-01-11"
    assert get_date_after_days("2024-01-01", 31) == "2024-02-01"

class MockPriceRepo:
    def __init__(self, prices):
        self.prices = prices
    def get_price_on_or_after(self, ticker, date_str):
        # Simplified: just return the price if it exists for the date or later
        sorted_dates = sorted(self.prices.get(ticker, {}).keys())
        for d in sorted_dates:
            if d >= date_str:
                return {"date": d, "close": self.prices[ticker][d]}
        return None

def test_evaluate_signal_alignment():
    companies = [
        {"id": "1", "name": "Co A", "ticker": "A", "benefit_score": 80.0},
        {"id": "2", "name": "Co B", "ticker": "B", "benefit_score": 40.0},
    ]
    prices = {
        "A": {"2024-01-01": 100.0, "2024-01-31": 110.0},
        "B": {"2024-01-01": 100.0, "2024-01-31": 95.0},
    }
    repo = MockPriceRepo(prices)
    
    result = evaluate_signal_alignment(companies, repo, baseline="2024-01-01", windows=(30,))
    
    assert result["baseline"] == "2024-01-01"
    assert len(result["companies"]) == 2
    
    summary = result["summary"]["windows"][0]
    assert summary["window_days"] == 30
    assert summary["evaluated_count"] == 2
    assert summary["direction_hit_rate"] == 1.0 # Both A (up/up) and B (down/down) hit
    assert summary["avg_return_high_signal"] == 10.0 # Co A
    assert summary["avg_return_low_signal"] == -5.0 # Co B
    assert summary["correlation"] == 1.0 # Perfect correlation between [80, 40] and [10, -5]
