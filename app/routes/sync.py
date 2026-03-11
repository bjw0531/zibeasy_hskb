"""
천안하우스 동기화 API 라우트
"""
from flask import Blueprint, request, jsonify
from sqlalchemy import text
import logging
import os
import base64
import json
from app.models import engine
from app.utils.geohash import generate_geohash
from werkzeug.utils import secure_filename

bp = Blueprint('sync', __name__)

AUTH_TOKEN = f"Bearer {os.environ.get('SYNC_API_TOKEN', 'default-token-please-change')}"

def check_auth():
    """인증 확인"""
    auth_header = request.headers.get('Authorization')
    if auth_header != AUTH_TOKEN:
        logging.warning(f"인증 실패: {request.remote_addr}")
        return False
    return True

@bp.route('/sync-property', methods=['POST'])
def sync_property():
    """천안하우스에서 매물 데이터 + 이미지 동시 수신"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        # 데이터 받기
        if request.is_json:
            data = request.get_json()
            files = {}
        else:
            data = request.form
            files = request.files
        
        # 필수 필드 확인
        if not data.get('code'):
            return jsonify({'success': False, 'error': 'code 필드가 필요합니다'}), 400
        
        # DB에 매물 정보 저장
        _save_property_data(data)
        
        # 이미지 저장
        saved_images = _save_property_images(data, files)
        
        logging.info(f"🎉 매물 동기화 성공: code={data.get('code')}")
        logging.info(f"📊 동기화 결과: 매물 데이터 ✅, 이미지 big={len(saved_images.get('big', []))}장")
        
        return jsonify({
            'success': True,
            'message': 'Property synced successfully',
            'code': data.get('code'),
            'images_saved': saved_images
        })
        
    except Exception as e:
        logging.error(f"동기화 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

@bp.route('/delete-property', methods=['POST'])
def delete_property():
    """매물 소프트 삭제 API"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        data = request.form
        code = data.get('code')
        
        if not code:
            return jsonify({'success': False, 'error': 'code 필드가 필요합니다'}), 400
        
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    UPDATE sswp_maemul
                    SET is_deleted = 1,
                        deleted_at = NOW(),
                        ldate = NOW()
                    WHERE code = :code
                      AND COALESCE(is_deleted, 0) = 0
                """),
                {'code': code}
            )
            deleted_count = result.rowcount
            conn.commit()
        
        if deleted_count > 0:
            logging.info(f"매물 삭제 성공: code={code}")
            return jsonify({
                'success': True,
                'message': 'Property deleted successfully',
                'code': code
            })
        else:
            logging.warning(f"삭제할 매물 없음: code={code}")
            return jsonify({'success': False, 'error': '매물을 찾을 수 없습니다'}), 404
        
    except Exception as e:
        logging.error(f"매물 삭제 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

@bp.route('/update-ldate', methods=['POST'])
def update_ldate():
    """매물 ldate만 업데이트"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        data = request.form
        code = data.get('code')
        
        if not code:
            return jsonify({'success': False, 'error': 'code 필수'}), 400
        
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    UPDATE sswp_maemul
                    SET ldate = NOW()
                    WHERE code = :code
                      AND COALESCE(is_deleted, 0) = 0
                """),
                {'code': code}
            )
            updated_count = result.rowcount
            conn.commit()
        
        if updated_count > 0:
            logging.info(f"ldate 업데이트 성공: code={code}")
            return jsonify({'success': True, 'message': 'ldate updated'})
        else:
            return jsonify({'success': False, 'error': '매물 없음'}), 404
        
    except Exception as e:
        logging.error(f"ldate 업데이트 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

@bp.route('/update-see', methods=['POST'])
def update_see():
    """매물 조회수(see) 동기화"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    try:
        data = request.form
        code = data.get('code')
        see = data.get('see')  # 조회수 값 받기

        if not code:
            return jsonify({'success': False, 'error': 'code 필수'}), 400
        
        if see is None:
            return jsonify({'success': False, 'error': 'see 필수'}), 400

        with engine.connect() as conn:
            # 조회수를 전달받은 값으로 설정 (증가가 아니라 SET)
            result = conn.execute(
                text("""
                    UPDATE sswp_maemul
                    SET see = :see
                    WHERE code = :code
                      AND COALESCE(is_deleted, 0) = 0
                """),
                {'code': code, 'see': int(see)}
            )
            updated_count = result.rowcount
            conn.commit()

        if updated_count > 0:
            logging.info(f"✅ 조회수 동기화 성공: code={code}, see={see}")
            return jsonify({'success': True, 'message': 'see updated'})
        else:
            logging.warning(f"⚠️ 조회수 동기화 실패: code={code} (매물 없음)")
            return jsonify({'success': False, 'error': '매물 없음'}), 404

    except Exception as e:
        logging.error(f"❌ 조회수 업데이트 오류: code={code}, error={str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

def _save_property_data(data):
    """매물 데이터 DB 저장"""
    with engine.connect() as conn:
        # 파라미터 준비
        params = _prepare_property_params(data)
        
        # INSERT ... ON DUPLICATE KEY UPDATE 쿼리
        sql = _get_insert_update_sql()
        
        conn.execute(text(sql), params)
        conn.commit()

def _save_property_images(data, files):
    """매물 이미지 저장"""
    saved_images = {'big': []}
    
    # Multipart 파일 수신 (big만)
    big_dir = 'data/maemul/big'
    os.makedirs(big_dir, exist_ok=True)
    
    for i in range(1, 21):  # 최대 20장
        file_key = f'image_big_{i}'
        if file_key in files:
            file = files[file_key]
            if file and file.filename:
                filename = file.filename
                # ✅ 보안: 파일시스템 저장 시에만 안전한 이름 사용 (DB는 원본 유지)
                safe_filename = secure_filename(filename)
                if not safe_filename:
                    continue
                    
                filepath = os.path.join(big_dir, safe_filename)
                file.save(filepath)
                saved_images['big'].append(filename)
                logging.info(f"✅ Multipart 이미지 저장 성공: {filename}")
    
    # Base64 이미지 처리 (big만)
    if 'encoded_images' in data and data['encoded_images']:
        encoded_images = data['encoded_images']

        # form-data로 넘어오는 경우 JSON 문자열일 수 있음
        if isinstance(encoded_images, str):
            try:
                encoded_images = json.loads(encoded_images)
            except Exception:
                encoded_images = {}

        if isinstance(encoded_images, dict):
            for pic_key, base64_data in encoded_images.items():
                # pic1_big 또는 pic1 형식만 허용 (mid/small 제거)
                key_text = str(pic_key)
                if '_' in key_text:
                    parts = key_text.split('_', 1)
                    if len(parts) != 2 or parts[1] != 'big':
                        continue
                    pic_num = parts[0]
                else:
                    pic_num = key_text

                if not base64_data or not isinstance(base64_data, str):
                    continue

                try:
                    # data URI 헤더가 있으면 제거
                    raw_base64 = base64_data.split(',', 1)[1] if 'base64,' in base64_data else base64_data
                    # Base64 디코딩
                    image_data = base64.b64decode(raw_base64)

                    # 파일명 가져오기
                    picname_key = pic_num.replace('pic', 'picname')
                    filename = data.get(picname_key, '')

                    if filename:
                        # ✅ 보안: 파일시스템 저장 시에만 안전한 이름 사용
                        safe_filename = secure_filename(filename)
                        if not safe_filename:
                            continue

                        filepath = os.path.join(big_dir, safe_filename)

                        with open(filepath, 'wb') as f:
                            f.write(image_data)

                        saved_images['big'].append(filename)
                        logging.info(f"✅ 이미지 저장 성공 (big): {filename}")

                except Exception as e:
                    logging.error(f"❌ 이미지 저장 실패 ({pic_key}): {str(e)}")
    
    return saved_images

def _prepare_property_params(data):
    """매물 파라미터 준비"""
    params = {
        'code': data.get('code', ''),
        'category': data.get('category', ''),
        'part': data.get('part', ''),
        'build_check': data.get('build_check', ''),
        'id': '',
    }
    
    # good1~15 추가
    for i in range(1, 16):
        params[f'good{i}'] = data.get(f'good{i}', 0)
    
    # thema1~15 추가
    for i in range(1, 16):
        params[f'thema{i}'] = data.get(f'thema{i}', 0)
    
    # 기본 필드들
    basic_fields = [
        'besticon', 'icon', 'si', 'gu', 'dong', 'ri', 'area', 'addr', 'title',
        'size', 'sil_size', 'ground_size', 'build_size',
        'maemae_money', 'jen_money', 'security_money', 'month_money',
        'security_money_sec', 'month_money_sec', 'plus_money', 'poung_money',
        'public_money', 'public_money1', 'public_money_opt', 'gun_money',
        'total_money', 'finance_money', 'sil_money', 'month_suic_money',
        'build_use_type', 'build_year', 'build_month', 'build_access_date', 'movein_day',
        'room', 'room1', 'room2', 'total_floor', 'now_floor', 'high_floor', 'under_floor',
        'parking', 'jimoc', 'used', 'use_area', 'jibun', 'suic_fer',
        'train_area', 'train_line', 'train_name', 'train_area2', 'train_line2', 'train_name2',
        'gudxo', 'gudxo1', 'gudxo2', 'aspect', 'memo', 'movie',
        'traffice', 'see', 'state', 'contract', 'opt_check', 'admin_memo',
        'wdate', 'ldate', 'lat', 'lng'
    ]
    
    for field in basic_fields:
        default_value = 0 if field in ['size', 'sil_size', 'ground_size', 'build_size',
                                        'maemae_money', 'jen_money', 'security_money', 'month_money',
                                        'security_money_sec', 'month_money_sec', 'poung_money',
                                        'finance_money', 'sil_money', 'month_suic_money',
                                        'see', 'opt_check', 'lat', 'lng', 'besticon'] else ''
        params[field] = data.get(field, default_value)
    
    # 옵션들 (household, electron, bathroom, security, etc, around)
    for prefix in ['household', 'electron', 'bathroom', 'security', 'etc', 'around']:
        for i in range(1, 7):
            params[f'{prefix}{i}'] = data.get(f'{prefix}{i}', 0)
    
    # 이미지 파일명
    for i in range(1, 21):
        params[f'picname{i}'] = data.get(f'picname{i}', '')
    
    # geohash 자동 생성
    params['geohash'] = generate_geohash(params['lat'], params['lng'])
    
    return params

def _get_insert_update_sql():
    """INSERT ... ON DUPLICATE KEY UPDATE SQL 반환"""
    # 컬럼 리스트
    columns = ['code', 'category', 'part', 'build_check', 'id']
    columns.extend([f'good{i}' for i in range(1, 16)])
    columns.extend([f'thema{i}' for i in range(1, 16)])
    columns.extend([
        'besticon', 'icon', 'si', 'gu', 'dong', 'ri', 'area', 'addr', 'title',
        'size', 'sil_size', 'ground_size', 'build_size',
        'maemae_money', 'jen_money', 'security_money', 'month_money',
        'security_money_sec', 'month_money_sec', 'plus_money', 'poung_money',
        'public_money', 'public_money1', 'public_money_opt', 'gun_money',
        'total_money', 'finance_money', 'sil_money', 'month_suic_money',
        'build_use_type', 'build_year', 'build_month', 'build_access_date', 'movein_day',
        'room', 'room1', 'room2', 'total_floor', 'now_floor', 'high_floor', 'under_floor',
        'parking', 'jimoc', 'used', 'use_area', 'jibun', 'suic_fer',
        'train_area', 'train_line', 'train_name', 'train_area2', 'train_line2', 'train_name2',
        'gudxo', 'gudxo1', 'gudxo2', 'aspect', 'memo', 'movie'
    ])
    columns.extend([f'household{i}' for i in range(1, 7)])
    columns.extend([f'electron{i}' for i in range(1, 7)])
    columns.extend([f'bathroom{i}' for i in range(1, 7)])
    columns.extend([f'security{i}' for i in range(1, 7)])
    columns.extend([f'etc{i}' for i in range(1, 7)])
    columns.extend([f'around{i}' for i in range(1, 7)])
    columns.append('traffice')
    columns.extend([f'picname{i}' for i in range(1, 21)])
    columns.extend(['see', 'state', 'contract', 'opt_check', 'admin_memo'])
    columns.extend(['wdate', 'ldate', 'lat', 'lng', 'geohash'])
    
    # INSERT 부분
    insert_cols = ', '.join(columns)
    insert_vals = ', '.join([f':{col}' for col in columns])
    
    # UPDATE 부분 (code 제외)
    update_cols = [col for col in columns if col != 'code']
    update_stmt = ', '.join([f'{col} = VALUES({col})' for col in update_cols])
    
    sql = f"""
    INSERT INTO sswp_maemul ({insert_cols})
    VALUES ({insert_vals})
    ON DUPLICATE KEY UPDATE {update_stmt}
    """
    
    return sql
