from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.utils.time import time_ago


KST = ZoneInfo("Asia/Seoul")


def test_time_ago_handles_naive_datetimes_as_kst():
    target = datetime.now(KST).replace(tzinfo=None) - timedelta(hours=4, minutes=5)

    assert time_ago(target) == "4시간 전"


def test_time_ago_handles_aware_kst_datetimes():
    target = datetime.now(KST) - timedelta(minutes=12)

    assert time_ago(target) == "12분 전"
