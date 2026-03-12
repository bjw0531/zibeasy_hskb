import os
from datetime import timedelta
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# MySQL 데이터베이스 설정
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER'),
    'password': os.environ.get('DB_PASSWORD'),
    'database': os.environ.get('DB_NAME', 'housekb_db'),
    'charset': 'utf8mb4'
}

# Flask 설정
class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-key-please-change-in-prod')
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    HOST = '0.0.0.0'
    PORT = int(os.environ.get('FLASK_PORT', 5002))
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'true').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    PERMANENT_SESSION_LIFETIME = timedelta(days=int(os.environ.get('SESSION_LIFETIME_DAYS', 7)))
    PREFERRED_URL_SCHEME = os.environ.get('PREFERRED_URL_SCHEME', 'https')
    
    # ✅ DB 연결 풀 설정 추가
    import urllib.parse
    password_encoded = urllib.parse.quote_plus(DB_CONFIG['password'])
    SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{DB_CONFIG['user']}:{password_encoded}@{DB_CONFIG['host']}/{DB_CONFIG['database']}?charset=utf8mb4"
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 20,        # 기본 연결 수
        'max_overflow': 30,     # 추가 연결 수 (총 50개)
        'pool_pre_ping': True,  # 연결 상태 확인
        'pool_recycle': 3600,   # 1시간마다 연결 재생성
        'pool_timeout': 30,     # 연결 대기 시간
    }

    # 업로드 파일 최대 크기: 30MB (제보 첨부 최대 5개 × 5MB 여유 반영)
    MAX_CONTENT_LENGTH = 30 * 1024 * 1024

    # Gmail SMTP 설정
    MAIL_HOST = os.environ.get('MAIL_HOST', 'smtp.gmail.com')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_FROM_NAME = os.environ.get('MAIL_FROM_NAME', '천안하우스')
    MAIL_FROM = os.environ.get('MAIL_FROM', '')
    ADMIN_NOTIFY_EMAIL = os.environ.get('ADMIN_NOTIFY_EMAIL', '')

    # 개인정보/운영 정책 설정
    PRIVACY_CONTACT_EMAIL = os.environ.get('PRIVACY_CONTACT_EMAIL', ADMIN_NOTIFY_EMAIL)
    HOUSE_REQUEST_RETENTION_DAYS = int(os.environ.get('HOUSE_REQUEST_RETENTION_DAYS', 365))
    FEEDBACK_RETENTION_DAYS = int(os.environ.get('FEEDBACK_RETENTION_DAYS', 365))
    ACCESS_ENTRY_RETENTION_DAYS = int(os.environ.get('ACCESS_ENTRY_RETENTION_DAYS', 365))
    ACCESS_FLOW_RETENTION_DAYS = int(os.environ.get('ACCESS_FLOW_RETENTION_DAYS', 60))
    CONSIGN_GOOGLE_SMTP = os.environ.get('CONSIGN_GOOGLE_SMTP', 'true').lower() == 'true'

    # Kakao
    KAKAO_JS_API_KEY = os.environ.get('KAKAO_JS_API_KEY', '')
