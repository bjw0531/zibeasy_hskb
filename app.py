"""
천안하우스 매물 지도 서버 - 메인 진입점
systemctl이 이 파일을 실행합니다.
"""
import os
from app import create_app
from config import Config

# Flask 앱 생성
app = create_app()

if __name__ == '__main__':
    # 시작시 필요한 디렉토리 생성
    for directory in ['logs', 'data', 'static/js', 'static/css', 'templates']:
        os.makedirs(directory, exist_ok=True)
    
    # 매물 이미지 디렉토리 생성 (big 전용)
    os.makedirs('data/maemul/big', exist_ok=True)
    
    print("=" * 60)
    print("🏠 천안하우스 매물 지도 서버 시작!")
    print("=" * 60)
    print(f"📍 메인: http://house.zibeasy.com")
    print(f"📋 목록: http://house.zibeasy.com/list")
    print(f"🔍 상세: http://house.zibeasy.com/view/<code>")
    print("-" * 60)
    print("🔗 API 엔드포인트:")
    print("  - GET  /api/properties          매물 목록")
    print("  - GET  /api/property/<id>       매물 상세")
    print("  - GET  /api/stats               통계")
    print("  - POST /api/sync-property       천안하우스 동기화")
    print("  - POST /api/delete-property     매물 삭제")
    print("  - POST /api/update-ldate        ldate 업데이트")
    print("  - GET  /images/maemul/big/<filename>  이미지")
    print("=" * 60)
    
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
