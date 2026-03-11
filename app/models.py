"""
데이터베이스 연결 및 쿼리 헬퍼 함수
"""
from sqlalchemy import create_engine, text
from sqlalchemy.pool import QueuePool
from config import Config

# 전역 엔진 객체
engine = None

def init_db(app):
    """DB 연결 풀 초기화"""
    global engine
    engine = create_engine(
        Config.SQLALCHEMY_DATABASE_URI,
        poolclass=QueuePool,
        **Config.SQLALCHEMY_ENGINE_OPTIONS
    )
    app.engine = engine

def get_db_connection():
    """연결 풀에서 DB 연결 가져오기"""
    return engine.connect()

def execute_query(query, params=None):
    """쿼리 실행 헬퍼 함수"""
    with engine.connect() as conn:
        if params:
            result = conn.execute(text(query), params)
        else:
            result = conn.execute(text(query))
        
        if query.strip().upper().startswith('SELECT'):
            return result.fetchall()
        else:
            conn.commit()
            return result.rowcount