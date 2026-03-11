"""
이미지 서빙 라우트
"""
from flask import Blueprint, send_file, jsonify
import os
import logging
from werkzeug.utils import secure_filename

bp = Blueprint('images', __name__)

@bp.route('/maemul/<size>/<filename>')
def serve_maemul_image(size, filename):
    """매물 이미지 서빙 (big 전용)"""
    try:
        # 사이즈 검증
        if size != 'big':
            return jsonify({'success': False, 'error': '잘못된 사이즈'}), 400
            
        # ✅ 보안: 경로 조작 방지 (../../etc/passwd 등 차단)
        # sync.py에서 저장할 때 secure_filename을 썼으므로, 읽을 때도 동일하게 적용해야 매칭됨
        safe_filename = secure_filename(filename)
        
        # 이미지 경로
        image_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            'data', 'maemul', size, safe_filename
        )
        
        if not os.path.exists(image_path):
            return jsonify({'success': False, 'error': '이미지를 찾을 수 없습니다'}), 404
        
        # 캐시 헤더 설정 (1시간 캐시)
        response = send_file(image_path)
        response.headers['Cache-Control'] = 'public, max-age=3600'
        response.headers['ETag'] = f'"{os.path.getmtime(image_path)}"'
        
        return response
        
    except Exception as e:
        logging.error(f"이미지 서빙 오류: {str(e)}")
        return jsonify({'success': False, 'error': '이미지를 불러올 수 없습니다'}), 404
