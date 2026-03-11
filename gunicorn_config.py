"""
Gunicorn 설정 파일
- AWS Lightsail 4GB (2 vCPU) 환경에 최적화
- 동시 접속자 150~200명 처리 가능
"""

import multiprocessing

# ============ 서버 바인딩 ============
# 외부 접근 허용 (천안하우스 매물 동기화 API 등)
bind = "0.0.0.0:5002"

# ============ 워커 설정 ============
# 워커 수: (2 * CPU 코어 수) + 1 = 5, 메모리 고려해서 4로 설정
workers = 4

# 각 워커당 스레드 수 (I/O 작업이 많은 웹앱에 효과적)
# ✅ [6단계] 2 → 4로 증가: gthread 워커와 함께 I/O 대기 중 다른 요청 처리 가능
threads = 4

# 워커 클래스
# ✅ [6단계] sync → gthread로 변경: DB/API 대기 중 다른 요청 처리 가능 (30~50% 동시처리 향상)
# ❌ 기존: worker_class = "sync" (I/O 대기 중 블로킹)
worker_class = "gthread"

# ============ 타임아웃 설정 ============
# 요청 처리 제한 시간 (초)
timeout = 120

# 워커가 응답 없을 때 강제 종료 대기 시간
graceful_timeout = 30

# Keep-alive 연결 유지 시간
keepalive = 5

# ============ 요청 제한 ============
# 최대 동시 연결 수 (워커당)
worker_connections = 1000

# 요청 본문 최대 크기 (10MB - 이미지 업로드 고려)
limit_request_body = 10485760

# ============ 로깅 설정 ============
# 에러 로그 파일
errorlog = "/home/ubuntu/housekb/logs/gunicorn_error.log"

# 액세스 로그 파일
accesslog = "/home/ubuntu/housekb/logs/gunicorn_access.log"

# 로그 레벨 (debug, info, warning, error, critical)
loglevel = "info"

# 액세스 로그 포맷
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# ============ 프로세스 관리 ============
# 데몬 모드 (systemd 사용시 False)
daemon = False

# PID 파일
pidfile = "/home/ubuntu/housekb/logs/gunicorn.pid"

# 워커 재시작 요청 수 (메모리 누수 방지)
max_requests = 1000

# 재시작 랜덤 범위 (동시 재시작 방지)
max_requests_jitter = 50

# ============ 보안 설정 ============
# 프록시 헤더 허용 (Nginx 뒤에서 실행)
forwarded_allow_ips = "127.0.0.1"

# ============ 서버 훅 ============
def on_starting(server):
    """서버 시작 시 실행"""
    print("=" * 60)
    print("Gunicorn 서버 시작!")
    print(f"워커 수: {workers}, 스레드: {threads}")
    print(f"바인딩: {bind}")
    print("=" * 60)

def worker_int(worker):
    """워커 종료 시 실행"""
    print(f"워커 {worker.pid} 종료됨")
