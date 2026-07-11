from datetime import datetime, timezone, timedelta
import numpy as np
import db

def _current_hour(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:00:00+00:00")

def _hours_since(hour_str: str, now: datetime | None = None) -> float:
    then = datetime.fromisoformat(hour_str)
    now  = now or datetime.now(timezone.utc)
    return (now - then).total_seconds() / 3600

def _classify(history: dict[str, int], current_hour: str, now: datetime | None = None) -> str:
    if not history:
        return "stable"

    hours_sorted = sorted(history.keys())
    age_hours = _hours_since(hours_sorted[0], now)

    if age_hours < 3:
        return "breaking"

    current_count = history.get(current_hour, 0)

    baseline = [
        count for hour, count in history.items()
        if hour != current_hour and _hours_since(hour, now) <= 24
    ]

    if len(baseline) < 2:
        return "stable"

    mean = np.mean(baseline)
    std  = max(np.std(baseline), 1.0)  

    if current_count > mean + 2 * std:
        return "accelerating"
    elif current_count < mean - std and age_hours > 6:
        return "fading"
    else:
        return "stable"
    
def compute_velocity_flags(thread_ids: list[int], now: datetime | None = None) -> dict[int, str]:
    history = db.get_thread_history(thread_ids)
    current = _current_hour(now)

    flags = {}
    for thread_id in thread_ids:
        thread_history = history.get(thread_id, {})
        flags[thread_id] = _classify(thread_history, current, now)

    return flags

