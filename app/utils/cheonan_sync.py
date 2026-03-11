"""
집이지 → 천안하우스 조회수 역방향 동기화 유틸
- 집이지에서 조회수 증가 시 천안하우스 서버로 전송
- 무한루프 방지: 이 함수는 main.py(/view/<code>) 에서만 호출됨
  sync.py(/api/update-see) 수신 시에는 절대 호출하지 않음
"""
import os
import logging
import requests

# 천안하우스 수신 엔드포인트 (환경변수에서 로드)
_CHEONAN_URL = os.environ.get('CHEONAN_RECEIVE_URL', '')

# 집이지 → 천안하우스 공유 토큰 (기존 토큰 재사용)
_TOKEN = os.environ.get('SYNC_API_TOKEN', '')


def update_see_to_cheonan(code: int, see: int) -> bool:
    """
    집이지 조회수 증가 시 천안하우스 서버로 전송

    Args:
        code: 매물 코드 번호
        see:  증가된 조회수 (절대값)

    Returns:
        True  - 전송 성공
        False - 전송 실패 (서비스에는 영향 없음, 로그만 기록)
    """
    if not _CHEONAN_URL:
        logging.warning("CHEONAN_RECEIVE_URL 환경변수가 설정되지 않음 - 조회수 동기화 스킵")
        return False

    url = f"{_CHEONAN_URL}?action=update-see"

    try:
        resp = requests.post(
            url,
            json={'code': code, 'see': see},
            headers={
                'Authorization': f'Bearer {_TOKEN}',
                'Content-Type': 'application/json',
            },
            timeout=2,          # 응답 대기 최대 2초 (사용자 응답 지연 최소화)
            allow_redirects=False,
        )

        if resp.status_code == 200:
            logging.info(f"✅ 천안하우스 조회수 동기화 성공: code={code}, see={see}")
            return True
        else:
            logging.warning(
                f"⚠️ 천안하우스 조회수 동기화 실패: code={code}, "
                f"HTTP={resp.status_code}, 응답={resp.text[:100]}"
            )
            return False

    except requests.exceptions.Timeout:
        # 타임아웃은 흔한 상황 - warning 수준으로만 기록
        logging.warning(f"⚠️ 천안하우스 조회수 동기화 타임아웃: code={code}")
        return False

    except Exception as e:
        logging.error(f"❌ 천안하우스 조회수 동기화 오류: code={code}, error={str(e)}")
        return False
