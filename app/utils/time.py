"""
시간 관련 유틸리티
"""
from datetime import datetime

def time_ago(dt: datetime) -> str:
    """경과 시간을 한국어로 표시"""
    now = datetime.now()
    diff = now - dt
    seconds = diff.total_seconds()

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