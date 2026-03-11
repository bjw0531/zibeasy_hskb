"""
WSGI 진입점 - Gunicorn이 이 파일을 통해 Flask 앱을 로드합니다.
"""
from app import create_app
from werkzeug.middleware.proxy_fix import ProxyFix

# Gunicorn이 사용할 Flask 앱 인스턴스
application = create_app()

# ── Nginx 리버스 프록시 헤더 신뢰 설정 ──────────────────────────
# Nginx가 X-Forwarded-Proto, X-Forwarded-Host 헤더를 전달하므로
# ProxyFix를 통해 Flask가 실제 도메인/프로토콜을 인식하게 함.
# → url_for(_external=True) 가 올바른 https://host/path URL을 생성함.
application.wsgi_app = ProxyFix(
    application.wsgi_app,
    x_proto=1,  # X-Forwarded-Proto (http/https 구분)
    x_host=1,   # X-Forwarded-Host  (실제 도메인명)
)

# 'app'으로도 접근 가능하도록 별칭 설정
app = application
