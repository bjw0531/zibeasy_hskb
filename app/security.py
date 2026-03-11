"""보안 유틸리티 (CSRF, 간단 레이트 리밋)."""
from __future__ import annotations

import hmac
import secrets
import threading
import time
from collections import deque
from typing import Deque

from flask import request, session


_rate_lock = threading.Lock()
_rate_buckets: dict[str, Deque[float]] = {}


def client_ip() -> str:
    """프록시 환경을 고려해 클라이언트 IP를 추출."""
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    return ip.split(",")[0].strip() or "unknown"


def get_csrf_token() -> str:
    """세션 기반 CSRF 토큰을 가져오거나 새로 생성."""
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def _read_request_csrf_token() -> str:
    """요청에서 CSRF 토큰 후보값을 읽는다."""
    token = (
        request.headers.get("X-CSRF-Token")
        or request.form.get("csrf_token")
        or request.headers.get("X-CSRFToken")
    )
    if token:
        return token

    if request.is_json:
        body = request.get_json(silent=True)
        if isinstance(body, dict):
            return str(body.get("csrf_token", "")).strip()
    return ""


def validate_csrf() -> bool:
    """요청의 CSRF 토큰 유효성 확인."""
    expected = session.get("_csrf_token", "")
    provided = _read_request_csrf_token()
    if not expected or not provided:
        return False
    return hmac.compare_digest(expected, provided)


def check_rate_limit(namespace: str, key: str, limit: int, window_sec: int) -> tuple[bool, int]:
    """
    단순 메모리 기반 레이트 리밋.
    반환값: (허용 여부, 재시도까지 남은 초)
    """
    now = time.time()
    bucket_key = f"{namespace}:{key}"

    with _rate_lock:
        q = _rate_buckets.get(bucket_key)
        if q is None:
            q = deque()
            _rate_buckets[bucket_key] = q

        cutoff = now - window_sec
        while q and q[0] <= cutoff:
            q.popleft()

        if len(q) >= limit:
            retry_after = int(max(1, window_sec - (now - q[0])))
            return False, retry_after

        q.append(now)
        return True, 0
