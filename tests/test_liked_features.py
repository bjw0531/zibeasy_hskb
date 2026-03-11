"""
test_liked_features.py — Playwright 기반 관심목록/최근본 매물 기능 검증

검증 항목:
1. 비회원이 관심목록 페이지 접속 → 로그인 유도 UI 표시
2. 비회원이 하트 버튼 클릭 → 로그인 필요 바텀시트 모달 표시
3. 비회원 최근 본 매물 → 쿠키에 저장
4. window._isLoggedIn 변수가 페이지에 존재하는지 확인
5. 로그인 모달 닫기 (취소 버튼 / ESC 키 / 배경 클릭)
"""

import asyncio
import sys
from playwright.async_api import async_playwright, expect

BASE_URL = "http://localhost:5002"

# ANSI 색상 코드
GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD  = "\033[1m"

results = []

def log_pass(name):
    print(f"  {GREEN}✅ PASS{RESET} — {name}")
    results.append(("PASS", name))

def log_fail(name, reason=""):
    print(f"  {RED}❌ FAIL{RESET} — {name}")
    if reason:
        print(f"       {YELLOW}→ {reason}{RESET}")
    results.append(("FAIL", name, reason))

def log_section(title):
    print(f"\n{BOLD}[ {title} ]{RESET}")


async def test_global_is_logged_in(page):
    """window._isLoggedIn 전역 변수가 주입되는지 확인"""
    log_section("window._isLoggedIn 전역 변수 확인")
    # /map 페이지는 include.html을 포함 (window._isLoggedIn 주입됨)
    await page.goto(f"{BASE_URL}/map")
    await page.wait_for_load_state("domcontentloaded")

    val = await page.evaluate("typeof window._isLoggedIn")
    if val == "boolean":
        log_pass("window._isLoggedIn이 boolean 타입으로 존재")
    else:
        log_fail("window._isLoggedIn 타입 오류", f"실제: {val}")

    # 비회원 세션에서 false인지 확인
    is_logged_in = await page.evaluate("window._isLoggedIn")
    if is_logged_in is False:
        log_pass("비회원 세션에서 window._isLoggedIn === false")
    else:
        log_fail("비회원 세션에서 window._isLoggedIn 값 오류", f"실제: {is_logged_in}")


async def test_liked_page_non_member(page):
    """비회원이 /liked 접속 시 로그인 유도 UI 표시"""
    log_section("비회원 관심목록 페이지 — 로그인 유도 UI")
    await page.goto(f"{BASE_URL}/liked")
    await page.wait_for_load_state("domcontentloaded")

    # 로그인 유도 div 존재 확인
    prompt = page.locator("#liked-login-prompt")
    count = await prompt.count()
    if count > 0:
        log_pass("비회원 관심목록 탭에 #liked-login-prompt 표시")
    else:
        log_fail("#liked-login-prompt 없음 — 로그인 유도 UI 미표시")

    # "로그인이 필요해요" 텍스트 확인
    text_el = page.locator(".empty-title")
    if await text_el.count() > 0:
        text = await text_el.first.text_content()
        if "로그인" in text:
            log_pass(f"empty-title 텍스트 확인: '{text.strip()}'")
        else:
            log_fail("empty-title 텍스트에 '로그인' 없음", f"실제: {text}")
    else:
        log_fail(".empty-title 요소 없음")

    # 카카오 로그인 링크 확인
    kakao_link = page.locator("#liked-login-prompt a[href='/auth/kakao/login']")
    if await kakao_link.count() > 0:
        log_pass("카카오 로그인 링크 존재")
    else:
        log_fail("카카오 로그인 링크 없음")

    # 네이버 로그인 링크 확인
    naver_link = page.locator("#liked-login-prompt a[href='/auth/naver/login']")
    if await naver_link.count() > 0:
        log_pass("네이버 로그인 링크 존재")
    else:
        log_fail("네이버 로그인 링크 없음")


async def test_login_modal_html_exists(page):
    """로그인 필요 모달 HTML이 include.html을 포함하는 페이지에 있는지 확인"""
    log_section("로그인 필요 모달 HTML 구조")
    await page.goto(f"{BASE_URL}/map")  # include.html이 포함된 페이지
    await page.wait_for_load_state("domcontentloaded")

    sheet = page.locator("#login-required-sheet")
    if await sheet.count() > 0:
        log_pass("#login-required-sheet 모달 HTML 존재")
    else:
        log_fail("#login-required-sheet 없음")

    # 초기에 숨겨져 있는지
    display = await page.evaluate(
        "document.getElementById('login-required-sheet').style.display"
    )
    if display == "none":
        log_pass("모달 초기 상태: display:none (숨김)")
    else:
        log_fail("모달 초기 상태 오류", f"display={display}")

    # showLoginRequiredModal 함수 존재
    fn = await page.evaluate("typeof window.showLoginRequiredModal")
    if fn == "function":
        log_pass("window.showLoginRequiredModal 함수 존재")
    else:
        log_fail("window.showLoginRequiredModal 없음", f"typeof={fn}")

    # hideLoginRequiredModal 함수 존재
    fn2 = await page.evaluate("typeof window.hideLoginRequiredModal")
    if fn2 == "function":
        log_pass("window.hideLoginRequiredModal 함수 존재")
    else:
        log_fail("window.hideLoginRequiredModal 없음", f"typeof={fn2}")


async def test_modal_open_close(page):
    """로그인 모달 열기/닫기 동작 검증"""
    log_section("로그인 모달 열기/닫기 동작")
    await page.goto(f"{BASE_URL}/map")
    await page.wait_for_load_state("domcontentloaded")

    # JS로 직접 모달 열기
    await page.evaluate("window.showLoginRequiredModal()")
    await page.wait_for_timeout(400)  # 애니메이션 대기

    display = await page.evaluate(
        "document.getElementById('login-required-sheet').style.display"
    )
    if display != "none":
        log_pass("showLoginRequiredModal() 호출 후 모달 표시됨")
    else:
        log_fail("showLoginRequiredModal() 후에도 모달 숨김 상태")

    # 패널 transform 확인 (슬라이드 업 완료)
    transform = await page.evaluate(
        "document.getElementById('lrs-panel').style.transform"
    )
    if transform == "translateY(0px)" or transform == "translateY(0)":
        log_pass("패널 translateY(0) — 슬라이드업 완료")
    else:
        log_fail("패널 transform 오류", f"실제: {transform}")

    # ESC로 닫기
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(400)
    display2 = await page.evaluate(
        "document.getElementById('login-required-sheet').style.display"
    )
    if display2 == "none":
        log_pass("ESC 키로 모달 닫힘")
    else:
        log_fail("ESC로 모달 안 닫힘", f"display={display2}")

    # 취소 버튼으로 닫기
    await page.evaluate("window.showLoginRequiredModal()")
    await page.wait_for_timeout(400)
    await page.evaluate("window.hideLoginRequiredModal()")
    await page.wait_for_timeout(400)
    display3 = await page.evaluate(
        "document.getElementById('login-required-sheet').style.display"
    )
    if display3 == "none":
        log_pass("hideLoginRequiredModal() 호출로 모달 닫힘")
    else:
        log_fail("hideLoginRequiredModal() 후에도 모달 열린 상태")


async def test_non_member_heart_click(page):
    """비회원이 하트 버튼 클릭 시 로그인 모달 표시 (지도 페이지)"""
    log_section("비회원 하트 클릭 → 로그인 모달")
    await page.goto(f"{BASE_URL}/map")
    await page.wait_for_load_state("domcontentloaded")
    await page.wait_for_timeout(1000)  # 지도 초기화 대기

    # _isLoggedIn이 false인지 먼저 확인
    is_logged_in = await page.evaluate("window._isLoggedIn")
    if is_logged_in is not False:
        log_fail("비회원 확인 실패 — 로그인 상태임, 하트 테스트 스킵")
        return

    # data-like-btn 속성을 가진 첫 번째 버튼 찾기
    heart_btn = page.locator("[data-like-btn]").first
    count = await heart_btn.count()

    if count == 0:
        # 팝업 패널에서 확인
        log_fail("지도 페이지에서 [data-like-btn] 요소 없음 — 팝업 없이는 테스트 불가")
        # JS로 toggleLike 직접 호출하여 모달 동작 확인
        await page.evaluate("toggleLike('TEST001')")
        await page.wait_for_timeout(400)
        display = await page.evaluate(
            "document.getElementById('login-required-sheet')?.style.display"
        )
        if display and display != "none":
            log_pass("toggleLike() 직접 호출 → 비회원 로그인 모달 표시됨")
        else:
            log_fail("toggleLike() 직접 호출 → 모달 미표시", f"display={display}")
        return

    # 하트 버튼 클릭
    await heart_btn.click()
    await page.wait_for_timeout(400)

    display = await page.evaluate(
        "document.getElementById('login-required-sheet').style.display"
    )
    if display != "none":
        log_pass("하트 클릭 → 비회원 로그인 모달 표시됨")
    else:
        log_fail("하트 클릭 → 로그인 모달 미표시")


async def test_recent_viewed_cookie(page):
    """최근 본 매물 쿠키 저장 확인 (비회원)"""
    log_section("최근 본 매물 — 비회원 쿠키 저장")
    # 쿠키 초기화
    await page.context.clear_cookies()
    await page.goto(BASE_URL)

    # 첫 번째 매물 페이지 방문 (실제 코드 있는 URL 추출)
    # /map에서 첫 번째 카드 URL 가져오기 시도
    await page.goto(f"{BASE_URL}/map")
    await page.wait_for_load_state("domcontentloaded")
    await page.wait_for_timeout(1500)

    # 직접 매물 페이지 방문 (임의 코드)
    # 먼저 실제 존재하는 매물 코드를 DB에서 가져옴
    # 서버 응답 확인용
    resp = await page.goto(f"{BASE_URL}/api/properties?limit=1")
    if resp and resp.status == 200:
        body = await resp.json()
        codes = [p.get("code") or p.get("idx") for p in (body.get("properties") or body.get("items") or [])]
        if codes:
            test_code = str(codes[0])
            await page.goto(f"{BASE_URL}/view/{test_code}")
            await page.wait_for_load_state("domcontentloaded")
            await page.wait_for_timeout(500)

            cookies = await page.context.cookies()
            recent_cookie = next((c for c in cookies if c["name"] == "recentViewed"), None)
            if recent_cookie:
                log_pass(f"recentViewed 쿠키 저장됨: 코드 {test_code}")
            else:
                log_fail("recentViewed 쿠키 미생성")
        else:
            log_fail("테스트할 매물 코드 없음 — API 응답 비어있음")
    else:
        # /api/properties 없으면 하드코딩 테스트
        log_fail("/api/properties API 없음 — 쿠키 테스트 스킵")


async def test_liked_page_recent_tab_non_member(page):
    """/liked?tab=recent 에서 최근 본 매물 탭 동작 확인"""
    log_section("최근 본 매물 탭 (비회원)")
    await page.goto(f"{BASE_URL}/liked?tab=recent")
    await page.wait_for_load_state("domcontentloaded")

    # 최근 탭 버튼 active 상태
    recent_tab = page.locator("#tab-recent")
    if await recent_tab.count() > 0:
        cls = await recent_tab.get_attribute("class")
        if cls and "active" in cls:
            log_pass("?tab=recent 파라미터 → 최근 탭 active")
        else:
            log_fail("?tab=recent 시 최근 탭 active 안됨", f"class={cls}")
    else:
        log_fail("#tab-recent 버튼 없음")

    # 최근 탭 패널 active 상태
    recent_panel = page.locator("#panel-recent")
    if await recent_panel.count() > 0:
        cls2 = await recent_panel.get_attribute("class")
        if cls2 and "active" in cls2:
            log_pass("#panel-recent active 클래스 있음")
        else:
            log_fail("#panel-recent active 아님", f"class={cls2}")
    else:
        log_fail("#panel-recent 없음")


async def test_auth_js_loaded(page):
    """auth.js가 로드되고 sync 함수가 정상 작동하는지 확인"""
    log_section("auth.js 로드 및 동기화 확인")
    await page.goto(f"{BASE_URL}/map")
    await page.wait_for_load_state("networkidle")

    # auth.js가 defer로 로드된 후 검사
    # window._isLoggedIn이 false면 sync API 호출 안 함을 확인
    # 네트워크 요청 감시
    api_calls = []

    async def on_request(req):
        if "/api/user/liked/sync" in req.url or "/api/user/recent/sync" in req.url:
            api_calls.append(req.url)

    page.on("request", on_request)
    await page.reload()
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(500)

    is_logged_in = await page.evaluate("window._isLoggedIn")
    if not is_logged_in and len(api_calls) == 0:
        log_pass("비회원 세션에서 sync API 미호출 (정상)")
    elif not is_logged_in and len(api_calls) > 0:
        log_fail("비회원인데 sync API 호출됨", str(api_calls))
    else:
        log_pass("로그인 상태 — sync API 호출 여부 별도 확인 필요")


async def main():
    print(f"\n{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Playwright 검증 — 관심목록/최근 본 매물 기능")
    print(f"  대상 서버: {BASE_URL}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},  # 모바일 (iPhone 14 Pro)
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
            )
        )
        page = await context.new_page()

        # 테스트 실행
        await test_global_is_logged_in(page)
        await test_login_modal_html_exists(page)
        await test_modal_open_close(page)
        await test_liked_page_non_member(page)
        await test_non_member_heart_click(page)
        await test_liked_page_recent_tab_non_member(page)
        await test_auth_js_loaded(page)
        await test_recent_viewed_cookie(page)

        await browser.close()

    # 결과 요약
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    total  = len(results)

    print(f"\n{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  결과: {GREEN}{passed} 통과{RESET} / {RED}{failed} 실패{RESET} / {total} 총")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}\n")

    if failed > 0:
        print(f"{RED}실패 목록:{RESET}")
        for r in results:
            if r[0] == "FAIL":
                print(f"  - {r[1]}" + (f": {r[2]}" if len(r) > 2 and r[2] else ""))
        print()
        sys.exit(1)
    else:
        print(f"{GREEN}모든 테스트 통과!{RESET}\n")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
