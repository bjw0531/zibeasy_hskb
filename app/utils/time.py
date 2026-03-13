"""
시간 관련 유틸리티
"""
from datetime import datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def _as_kst_datetime(dt: datetime) -> datetime | None:
    """DB datetime을 KST 기준 datetime으로 정규화한다."""
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=KST)
    return dt.astimezone(KST)


def time_ago(dt: datetime) -> str:
    """경과 시간을 한국어로 표시"""
    target = _as_kst_datetime(dt)
    if target is None:
        return "확인필요"

    now = datetime.now(KST)
    diff = now - target
    seconds = max(diff.total_seconds(), 0)

    if seconds < 60:
        return "방금 전"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        return f"{minutes}분 전"
    elif seconds < 86400:
        hours = int(seconds // 3600)
        return f"{hours}시간 전"
    elif seconds < 1296000:  # ✅ 15일 (15 * 86400)
        days = int(seconds // 86400)
        return f"{days}일 전"
    elif seconds < 2592000:  # ✅ 30일 미만
        weeks = int(seconds // 604800)
        return f"{weeks}주 전"
    else:
        # ✅ 30일 이상이면 "확인필요"
        return "확인필요"
