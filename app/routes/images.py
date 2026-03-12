"""
이미지 서빙 라우트
"""
from flask import Blueprint, send_file, jsonify
import logging

from app.utils.maemul_images import get_maemul_image_path, SUPPORTED_SIZES

bp = Blueprint('images', __name__)

@bp.route('/maemul/<size>/<filename>')
def serve_maemul_image(size, filename):
    """매물 이미지 서빙 (big/thumb)"""
    try:
        if size not in SUPPORTED_SIZES:
            return jsonify({'success': False, 'error': '잘못된 사이즈'}), 400

        image_path = get_maemul_image_path(size, filename)
        if not image_path.exists():
            return jsonify({'success': False, 'error': '이미지를 찾을 수 없습니다'}), 404

        response = send_file(image_path)
        response.headers['Cache-Control'] = 'public, max-age=3600'
        response.headers['ETag'] = f'"{image_path.stat().st_mtime}"'
        return response

    except Exception as e:
        logging.error(f"이미지 서빙 오류: {str(e)}")
        return jsonify({'success': False, 'error': '이미지를 불러올 수 없습니다'}), 404
