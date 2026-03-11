"""
User-Agent 파싱 유틸리티
외부 라이브러리 없이 정규식으로 브라우저/OS/기기 종류 추출
"""


def parse_user_agent(ua_string: str) -> tuple:
    """
    User-Agent 문자열에서 브라우저, OS, 기기 종류 추출
    반환: (browser, os_name, device)
    """
    ua = (ua_string or '').lower()

    # ── 기기 종류 ──────────────────────────────────────────────────
    if any(x in ua for x in ('ipad', 'tablet')):
        device = 'tablet'
    elif any(x in ua for x in ('android', 'iphone', 'mobile', 'blackberry', 'windows phone')):
        device = 'mobile'
    else:
        device = 'desktop'

    # ── 운영체제 ────────────────────────────────────────────────────
    if 'android' in ua:
        os_name = 'Android'
    elif 'iphone' in ua or 'ipad' in ua:
        os_name = 'iOS'
    elif 'windows phone' in ua:
        os_name = 'Windows Phone'
    elif 'windows' in ua:
        os_name = 'Windows'
    elif 'mac os' in ua or 'macos' in ua:
        os_name = 'macOS'
    elif 'linux' in ua:
        os_name = 'Linux'
    else:
        os_name = 'unknown'

    # ── 브라우저 (더 구체적인 것부터 체크) ──────────────────────────
    if 'samsungbrowser' in ua:
        browser = 'Samsung Browser'
    elif 'edg/' in ua or 'edge/' in ua:
        browser = 'Edge'
    elif 'opr/' in ua or 'opera' in ua:
        browser = 'Opera'
    elif 'chrome/' in ua and 'chromium' not in ua:
        browser = 'Chrome'
    elif 'firefox/' in ua:
        browser = 'Firefox'
    elif 'safari/' in ua and 'chrome' not in ua:
        browser = 'Safari'
    else:
        browser = 'unknown'

    return browser, os_name, device
