"""
로깅 설정 유틸리티
"""
import logging
import pytz
from datetime import datetime

class KSTFormatter(logging.Formatter):
    """한국 시간대(KST) 포맷터"""
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=pytz.timezone('Asia/Seoul'))
        if datefmt:
            s = dt.strftime(datefmt)
        else:
            s = dt.strftime('%Y-%m-%d %H:%M:%S')
        return s

def setup_logging():
    """로깅 설정"""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # 기존 핸들러 제거
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # 파일 핸들러 설정
    file_handler = logging.FileHandler('logs/app.log')
    file_handler.setFormatter(
        KSTFormatter('%(asctime)s KST - %(levelname)s - %(message)s')
    )
    logger.addHandler(file_handler)