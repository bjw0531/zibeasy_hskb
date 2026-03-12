"""
매물 조회 API 라우트
"""
from flask import Blueprint, request, jsonify, session
from sqlalchemy import text
import logging
import os
import json
import requests
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
from app.models import engine
from app.utils.geohash import get_geohash_bounds

bp = Blueprint('api', __name__)

# 네이버 검색 API 설정
NAVER_CLIENT_ID = os.environ.get('NAVER_CLIENT_ID', '')
NAVER_CLIENT_SECRET = os.environ.get('NAVER_CLIENT_SECRET', '')

# 카카오 Local API 설정
KAKAO_REST_API_KEY = os.environ.get('KAKAO_REST_API_KEY', '')

# TAGO API 설정 (버스정류장 전용) - 폴백용으로 유지
TAGO_API_KEY = os.environ.get('TAGO_API_KEY', '')

# 카테고리별 검색 키워드 매핑 (카카오 API용)
POI_CATEGORIES = {
    'convenience': '편의점',
    'laundry': '세탁소',
    'bank': '은행',
    'mart': '마트',
    'cafe': '커피숍',
    'gym': '헬스클럽'
}

# 버스정류장 카테고리
BUS_CATEGORY = 'bus'

# ============ 로컬 버스 데이터 로드 ============
BUS_DATA_FILE = Path(__file__).parent.parent.parent / 'data' / 'bus_stops_cheonan.json'
BUS_STOPS_DATA = None  # 앱 시작 시 로드됨


def _append_listing_visibility_conditions(where_conditions, property_status='available', listing_scope='recent'):
    """매물 노출 기본 조건을 전체필터 상태에 맞게 추가."""
    where_conditions.append("state = '등록'")

    if listing_scope != 'all_registered':
        where_conditions.append("ldate >= DATE_SUB(NOW(), INTERVAL 30 DAY)")

        if property_status != 'all_status':
            where_conditions.append("(contract IS NULL OR contract = '' OR contract = '계약가능')")

    return where_conditions

def load_bus_data():
    """로컬 버스 데이터 로드"""
    global BUS_STOPS_DATA
    if BUS_STOPS_DATA is not None:
        return BUS_STOPS_DATA
    
    if not BUS_DATA_FILE.exists():
        logging.warning(f"버스 데이터 파일이 없습니다: {BUS_DATA_FILE}")
        return None
    
    try:
        with open(BUS_DATA_FILE, 'r', encoding='utf-8') as f:
            BUS_STOPS_DATA = json.load(f)
        logging.info(f"버스 데이터 로드 완료: {len(BUS_STOPS_DATA.get('stops', []))}개 정류소")
        return BUS_STOPS_DATA
    except Exception as e:
        logging.error(f"버스 데이터 로드 실패: {e}")
        return None



def haversine_distance(lat1, lng1, lat2, lng2):
    """두 좌표 간의 거리 계산 (미터 단위)"""
    R = 6371000  # 지구 반지름 (미터)
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    
    a = sin(delta_lat/2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c

@bp.route('/properties', methods=['GET', 'POST'])
def get_properties():
    """매물 목록 조회
    GET : 일반 쿼리스트링 방식
    POST: 광역 클러스터(충남/서북구 등) 코드 목록이 많을 때 URL 길이 한계를 피하기 위해
          codes 를 JSON body 로 전달받음 (나머지 필터는 여전히 쿼리스트링 사용)
    """
    try:
        with engine.connect() as conn:
            # ✅ POST일 때 JSON body에서 codes 추출, 없으면 GET 쿼리스트링 사용
            _json_body = {}
            if request.method == 'POST' and request.is_json:
                _json_body = request.get_json(silent=True) or {}

            # 기본 필터 조건
            filters = {
                'si': request.args.get('si', ''),
                'gu': request.args.get('gu', ''),
                'dong': request.args.get('dong', ''),
                'category': request.args.get('category', ''),
                'code': request.args.get('code', '').strip(),
                'codes': _json_body.get('codes', '') or request.args.get('codes', ''),  # POST body 우선
                'limit': int(request.args.get('limit', 5000)),
                'offset': int(request.args.get('offset', 0)),
                'count_only': request.args.get('count_only', '').lower() == 'true'
            }

            # ✅ 전체 필터 파라미터
            full_filters = {
                'trade_type': request.args.get('trade_type', ''),  # 거래유형: monthly,jeonse,short_term
                'deposit_min': request.args.get('deposit_min', type=int),  # 보증금 최소 (만원)
                'deposit_max': request.args.get('deposit_max', type=int),  # 보증금 최대 (만원)
                'monthly_min': request.args.get('monthly_min', type=int),  # 월세 최소 (만원)
                'monthly_max': request.args.get('monthly_max', type=int),  # 월세 최대 (만원)
                'include_management': request.args.get('include_management', '').lower() == 'true',  # 관리비 포함
                'kitchen': request.args.get('kitchen', ''),  # 주방: separate,open
                'balcony': request.args.get('balcony', ''),  # 베란다: separate,extended
                'room_type': request.args.get('room_type', ''),  # 매물형태: separate,arch,duplex
                'area_min': request.args.get('area_min', type=int),  # 면적 최소 (㎡)
                'area_max': request.args.get('area_max', type=int),  # 면적 최대 (㎡)
                'floor': request.args.get('floor', ''),  # 층수: 1,2,middle,top,rooftop
                'building_age': request.args.get('building_age', ''),  # 건물년차: 5,10,15,15over
                'options': request.args.get('options', ''),  # 기타사항: south,internet_included,...
                'thema': request.args.get('thema', ''),  # ✅ 테마 필터: thema14 등
                'thema_categories': request.args.get('thema_categories', ''),  # ✅ 테마+카테고리 필터: thema10:91
                'property_status': request.args.get('property_status', 'available'),  # available | all_status
                'listing_scope': request.args.get('listing_scope', 'recent')  # recent | all_registered
            }
            
            # 지도 화면 영역 파라미터
            sw_lat = request.args.get('sw_lat', type=float)
            sw_lng = request.args.get('sw_lng', type=float)
            ne_lat = request.args.get('ne_lat', type=float)
            ne_lng = request.args.get('ne_lng', type=float)
            
            # ✅ 정렬 파라미터 (recent: 최근 수정순 / distance: 거리 가까운순)
            sort_mode = request.args.get('sort', 'recent')
            center_lat = request.args.get('center_lat', type=float)
            center_lng = request.args.get('center_lng', type=float)
            has_center = center_lat is not None and center_lng is not None

            # 쿼리 조건 생성
            where_conditions = ["COALESCE(is_deleted, 0) = 0"]
            params = []
            param_index = 0
            geohash_bounds = None  # ✅ 초기화 위치 이동

            if filters['codes']:
                # 관심목록: 등록된 매물이면 기간/계약 상태 상관없이 전부 가져오기
                # state = '등록' 조건 제거: 찜한 매물은 상태가 변해도(예: 계약완료) 보여야 함
                # where_conditions.append("state = '등록'")

                code_list = [code.strip() for code in filters['codes'].split(',') if code.strip()]
                logging.info(f"Wishlist request codes: {code_list}")

                if not code_list:
                    return jsonify({
                        'success': True,
                        'count': 0,
                        'filters': filters,
                        'geohash_used': False,
                        'data': []
                    })

                placeholders = ', '.join([f":param_{param_index + i}" for i in range(len(code_list))])
                # code 컬럼 또는 idx 컬럼 중 하나라도 일치하면 조회 (ID/Code 혼용 대응)
                where_conditions.append(f"(code IN ({placeholders}) OR idx IN ({placeholders}))")
                
                # 파라미터 이름 재정의
                placeholders_code = ', '.join([f":param_{param_index + i}" for i in range(len(code_list))])
                placeholders_idx = ', '.join([f":param_{param_index + len(code_list) + i}" for i in range(len(code_list))])
                
                where_conditions.pop() # 방금 넣은거 취소
                where_conditions.append(f"(code IN ({placeholders_code}) OR idx IN ({placeholders_idx}))")
                
                params.extend(code_list) # code용
                params.extend(code_list) # idx용
                param_index += len(code_list) * 2

            else:
                # 지도 등 일반 조회에서는 기존 조건 유지
                where_conditions = [
                    "COALESCE(is_deleted, 0) = 0"
                ]
                _append_listing_visibility_conditions(
                    where_conditions,
                    property_status=full_filters['property_status'],
                    listing_scope=full_filters['listing_scope']
                )

                if filters['si']:
                    where_conditions.append(f"si LIKE :param_{param_index}")
                    params.append(f"%{filters['si']}%")
                    param_index += 1
                
                if filters['gu']:
                    where_conditions.append(f"gu LIKE :param_{param_index}")
                    params.append(f"%{filters['gu']}%")
                    param_index += 1
                    
                if filters['dong']:
                    where_conditions.append(f"dong LIKE :param_{param_index}")
                    params.append(f"%{filters['dong']}%")
                    param_index += 1
                
                if filters['category']:
                    category_list = filters['category'].split(',')
                    if len(category_list) == 1:
                        where_conditions.append(f"category = :param_{param_index}")
                        params.append(category_list[0].strip())
                        param_index += 1
                    else:
                        placeholders = ', '.join([f":param_{param_index + i}" for i in range(len(category_list))])
                        where_conditions.append(f"category IN ({placeholders})")
                        params.extend([cat.strip() for cat in category_list])
                        param_index += len(category_list)

                # 매물번호(또는 idx) 정확 일치 검색
                if filters['code']:
                    if filters['code'].isdigit():
                        code_value = int(filters['code'])
                        where_conditions.append(
                            f"(code = :param_{param_index} OR idx = :param_{param_index + 1})"
                        )
                        params.extend([code_value, code_value])
                        param_index += 2
                    else:
                        # 숫자가 아닌 값은 검색 결과가 없도록 안전하게 처리
                        where_conditions.append("1 = 0")
                
                # 화면 영역 필터 추가
                if all([sw_lat, sw_lng, ne_lat, ne_lng]):
                    geohash_bounds = get_geohash_bounds(sw_lat, sw_lng, ne_lat, ne_lng)

                    where_conditions.append(f"lat BETWEEN :param_{param_index} AND :param_{param_index + 1}")
                    where_conditions.append(f"lng BETWEEN :param_{param_index + 2} AND :param_{param_index + 3}")
                    params.extend([sw_lat, ne_lat, sw_lng, ne_lng])
                    param_index += 4

                # ✅ 전체 필터 조건 추가

                # 거래유형 필터 (월세/전세/무보증단기)
                if full_filters['trade_type']:
                    trade_types = [t.strip() for t in full_filters['trade_type'].split(',')]
                    trade_conditions = []

                    if 'monthly' in trade_types:
                        # 월세: part='임대' AND security_money IS NOT NULL
                        trade_conditions.append("(part = '임대' AND security_money IS NOT NULL AND security_money != '')")
                    if 'jeonse' in trade_types:
                        # 전세: part='임대' AND jen_money IS NOT NULL
                        trade_conditions.append("(part = '임대' AND jen_money IS NOT NULL AND jen_money != '')")
                    if 'short_term' in trade_types:
                        # 무보증/단기: category='92'
                        trade_conditions.append("category = '92'")

                    if trade_conditions:
                        where_conditions.append(f"({' OR '.join(trade_conditions)})")

                # 보증금 필터 (만원 단위)
                if full_filters['deposit_min'] is not None:
                    where_conditions.append(f"CAST(security_money AS SIGNED) >= :param_{param_index}")
                    params.append(full_filters['deposit_min'])
                    param_index += 1

                if full_filters['deposit_max'] is not None:
                    where_conditions.append(f"CAST(security_money AS SIGNED) <= :param_{param_index}")
                    params.append(full_filters['deposit_max'])
                    param_index += 1

                # 월세 필터 (만원 단위, 관리비 포함 옵션)
                # 주의: month_money는 만원 단위, public_money는 원 단위 (70000 = 7만원)
                if full_filters['monthly_min'] is not None:
                    if full_filters['include_management']:
                        # 관리비 포함: month_money + (public_money / 10000)
                        where_conditions.append(f"(CAST(COALESCE(month_money, 0) AS SIGNED) + CAST(COALESCE(public_money, 0) AS SIGNED) / 10000) >= :param_{param_index}")
                    else:
                        where_conditions.append(f"CAST(month_money AS SIGNED) >= :param_{param_index}")
                    params.append(full_filters['monthly_min'])
                    param_index += 1

                if full_filters['monthly_max'] is not None:
                    if full_filters['include_management']:
                        where_conditions.append(f"(CAST(COALESCE(month_money, 0) AS SIGNED) + CAST(COALESCE(public_money, 0) AS SIGNED) / 10000) <= :param_{param_index}")
                    else:
                        where_conditions.append(f"CAST(month_money AS SIGNED) <= :param_{param_index}")
                    params.append(full_filters['monthly_max'])
                    param_index += 1

                # 주방 타입 필터 (room1 컬럼)
                if full_filters['kitchen']:
                    kitchen_types = [k.strip() for k in full_filters['kitchen'].split(',')]
                    kitchen_conditions = []
                    if 'separate' in kitchen_types:
                        kitchen_conditions.append("room1 LIKE '%분리형%'")
                    if 'open' in kitchen_types:
                        kitchen_conditions.append("room1 LIKE '%오픈형%'")
                    if kitchen_conditions:
                        where_conditions.append(f"({' OR '.join(kitchen_conditions)})")

                # 베란다 타입 필터 (room2 컬럼: 유=분리형, 무=확장형)
                if full_filters['balcony']:
                    balcony_types = [b.strip() for b in full_filters['balcony'].split(',')]
                    balcony_conditions = []
                    if 'separate' in balcony_types:
                        balcony_conditions.append("room2 LIKE '%유%'")
                    if 'extended' in balcony_types:
                        balcony_conditions.append("room2 LIKE '%무%'")
                    if balcony_conditions:
                        where_conditions.append(f"({' OR '.join(balcony_conditions)})")

                # 매물형태 필터 (gudxo1 컬럼: 분리형/아치형/복층형)
                if full_filters['room_type']:
                    room_types = [r.strip() for r in full_filters['room_type'].split(',')]
                    room_conditions = []
                    if 'separate' in room_types:
                        room_conditions.append("gudxo1 LIKE '%분리형%'")
                    if 'arch' in room_types:
                        room_conditions.append("gudxo1 LIKE '%아치형%'")
                    if 'duplex' in room_types:
                        room_conditions.append("gudxo1 LIKE '%복층형%'")
                    if room_conditions:
                        where_conditions.append(f"({' OR '.join(room_conditions)})")

                # 면적 필터 (size 컬럼, ㎡ 단위)
                if full_filters['area_min'] is not None:
                    where_conditions.append(f"CAST(size AS SIGNED) >= :param_{param_index}")
                    params.append(full_filters['area_min'])
                    param_index += 1

                if full_filters['area_max'] is not None:
                    where_conditions.append(f"CAST(size AS SIGNED) <= :param_{param_index}")
                    params.append(full_filters['area_max'])
                    param_index += 1

                # 층수 필터 (now_floor, total_floor 컬럼)
                if full_filters['floor']:
                    floor_types = [f.strip() for f in full_filters['floor'].split(',')]
                    floor_conditions = []

                    if '1' in floor_types:
                        floor_conditions.append("now_floor = '1'")
                    if '2' in floor_types:
                        floor_conditions.append("now_floor = '2'")
                    if 'middle' in floor_types:
                        # 중간층: total_floor가 3 이상이면서 최상층/1층/2층이 아닌 경우
                        floor_conditions.append("""(
                            (CAST(total_floor AS SIGNED) = 3 AND now_floor = '2') OR
                            (CAST(total_floor AS SIGNED) = 4 AND now_floor = '3') OR
                            (CAST(total_floor AS SIGNED) >= 5 AND CAST(now_floor AS SIGNED) >= 3 AND CAST(now_floor AS SIGNED) < CAST(total_floor AS SIGNED))
                        )""")
                    if 'top' in floor_types:
                        # 최상층: now_floor = total_floor
                        floor_conditions.append("(now_floor = total_floor AND now_floor != '옥탑')")
                    if 'rooftop' in floor_types:
                        floor_conditions.append("now_floor = '옥탑'")

                    if floor_conditions:
                        where_conditions.append(f"({' OR '.join(floor_conditions)})")

                # 건물년차 필터 (build_access_date 컬럼)
                if full_filters['building_age']:
                    age_types = [a.strip() for a in full_filters['building_age'].split(',')]
                    age_conditions = []

                    if '5' in age_types:
                        # 5년 이내
                        age_conditions.append("""(
                            STR_TO_DATE(REPLACE(build_access_date, '.', ''), '%Y%m%d') >= DATE_SUB(NOW(), INTERVAL 5 YEAR)
                        )""")
                    if '10' in age_types:
                        # 10년 이내
                        age_conditions.append("""(
                            STR_TO_DATE(REPLACE(build_access_date, '.', ''), '%Y%m%d') >= DATE_SUB(NOW(), INTERVAL 10 YEAR)
                        )""")
                    if '15' in age_types:
                        # 15년 이내
                        age_conditions.append("""(
                            STR_TO_DATE(REPLACE(build_access_date, '.', ''), '%Y%m%d') >= DATE_SUB(NOW(), INTERVAL 15 YEAR)
                        )""")
                    if '15over' in age_types:
                        # 15년 이상
                        age_conditions.append("""(
                            STR_TO_DATE(REPLACE(build_access_date, '.', ''), '%Y%m%d') < DATE_SUB(NOW(), INTERVAL 15 YEAR)
                        )""")

                    if age_conditions:
                        where_conditions.append(f"({' OR '.join(age_conditions)})")

                # 기타사항 필터
                if full_filters['options']:
                    options = [o.strip() for o in full_filters['options'].split(',')]

                    if 'south' in options:
                        where_conditions.append("aspect LIKE '%남향%'")
                    if 'internet_included' in options:
                        where_conditions.append("public_money1 LIKE '%인터넷%'")
                    if 'internet_separate' in options:
                        where_conditions.append("(public_money1 IS NULL OR public_money1 NOT LIKE '%인터넷%')")
                    if 'elevator' in options:
                        where_conditions.append("etc1 = '1'")
                    if 'parking_gate' in options:
                        where_conditions.append("etc4 = '1'")
                    if 'drum_washer' in options:
                        where_conditions.append("electron4 = '1'")
                    if 'normal_washer' in options:
                        where_conditions.append("electron5 = '1'")
                    if 'door_lock' in options:
                        where_conditions.append("security5 = '1'")
                    if 'terrace' in options:
                        where_conditions.append("title LIKE '%테라스%'")

                # ✅ 테마 필터 (thema14, good6 등)
                if full_filters['thema']:
                    thema_columns = full_filters['thema'].split(',')
                    # 유효한 테마 컬럼인지 확인 (SQL Injection 방지)
                    valid_thema_columns = ['thema14', 'thema1', 'thema2', 'thema3', 'thema4', 'thema5',
                                          'thema6', 'thema7', 'thema8', 'thema9', 'thema10',
                                          'thema11', 'thema12', 'thema13', 'thema15',
                                          'good1', 'good2', 'good3', 'good4', 'good5', 'good6', 'good7']
                    thema_conditions = []
                    for thema_column in thema_columns:
                        thema_column = thema_column.strip()
                        if thema_column in valid_thema_columns:
                            thema_conditions.append(f"{thema_column} = '1'")
                    if thema_conditions:
                        where_conditions.append(f"({' OR '.join(thema_conditions)})")

                # ✅ 테마+카테고리 필터 (thema10:91 형태)
                if full_filters['thema_categories']:
                    thema_cat_list = full_filters['thema_categories'].split(',')
                    valid_thema_columns = ['thema14', 'thema1', 'thema2', 'thema3', 'thema4', 'thema5',
                                          'thema6', 'thema7', 'thema8', 'thema9', 'thema10',
                                          'thema11', 'thema12', 'thema13', 'thema15',
                                          'good1', 'good2', 'good3', 'good4', 'good5', 'good6', 'good7']
                    thema_cat_conditions = []
                    for item in thema_cat_list:
                        if ':' in item:
                            col, cat = item.split(':', 1)
                            col = col.strip()
                            cat = cat.strip()
                            if col in valid_thema_columns and cat.isdigit():
                                thema_cat_conditions.append(f"({col} = '1' AND category = '{cat}')")
                    if thema_cat_conditions:
                        where_conditions.append(f"({' OR '.join(thema_cat_conditions)})")

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
        
            # count_only가 true면 개수만 조회
            if filters['count_only']:
                count_query = f"""
                    SELECT COUNT(*) as total_count
                    FROM sswp_maemul 
                    WHERE {where_clause}
                """
                count_params = {f'param_{i}': p for i, p in enumerate(params)}
                result = conn.execute(text(count_query), count_params)
                total_count = result.fetchone()[0]
                
                return jsonify({
                    'success': True,
                    'count': total_count,
                    'filters': filters,
                    'geohash_used': bool(geohash_bounds),
                    'data': []
                })
        
            # mode 확인 (light: 가벼운 데이터, 그 외: 전체 데이터)
            mode = request.args.get('mode', 'full')

            # 일반 데이터 조회
            if mode == 'light':
                # ✅ Light Mode: 필요한 최소 필드만 조회 (이미지, 상세설명 제외)
                # 클러스터링 및 지도 표시에 필요한 정보만
                select_clause = """
                    idx, code, category, si, gu, dong, ri, 
                    lat, lng, geohash, state, contract
                """
            else:
                # Full Mode: 기존 전체 필드 + 필터용 필드
                select_clause = """
                    idx, code, category, si, gu, dong, ri, title, 
                    lat, lng, geohash, size, maemae_money, jen_money, traffice,
                    security_money, month_money, public_money, now_floor, total_floor,
                    picname1, picname3, picname5, picname7, ldate, state, contract, movie,
                    aspect, etc1, etc4, electron4, electron5, security5, public_money1
                """

            # ✅ 정렬 방식에 따라 ORDER BY 결정
            # 거리순: ST_Distance_Sphere 함수로 서버에서 직접 거리 계산 (MySQL 8.0+)
            if sort_mode == 'distance' and has_center:
                # 거리순 정렬: 지도 중심으로부터의 직선거리 오름차순
                # 응답에 _distance(km) 포함하여 클라이언트 거리 배지 표시에 활용
                distance_expr = (
                    "ST_Distance_Sphere(POINT(lng, lat), POINT(:center_lng, :center_lat)) / 1000"
                )
                select_clause_dist = f"{select_clause}, {distance_expr} AS _distance"
                order_clause = "ORDER BY ST_Distance_Sphere(POINT(lng, lat), POINT(:center_lng, :center_lat))"
                query = f"""
                    SELECT {select_clause_dist}
                    FROM sswp_maemul
                    WHERE {where_clause}
                    {order_clause}
                    LIMIT :limit OFFSET :offset
                """
                query_params = {
                    **{f'param_{i}': p for i, p in enumerate(params)},
                    'center_lat': center_lat,
                    'center_lng': center_lng,
                    'limit': filters['limit'],
                    'offset': filters['offset']
                }
            else:
                # 최근 수정순 정렬 (기존 방식)
                query = f"""
                    SELECT {select_clause}
                    FROM sswp_maemul
                    WHERE {where_clause}
                    ORDER BY ldate DESC
                    LIMIT :limit OFFSET :offset
                """
                query_params = {
                    **{f'param_{i}': p for i, p in enumerate(params)},
                    'limit': filters['limit'],
                    'offset': filters['offset']
                }

            # 디버깅을 위한 쿼리 로그
            logging.info(f"Executing Query: {query}")
            logging.info(f"Query Params: {query_params}")

            result = conn.execute(text(query), query_params)
            properties = result.fetchall()

            # 딕셔너리 형태로 변환
            properties_list = [dict(row._mapping) for row in properties]

            # ✅ Decimal 타입 → float 변환 (_distance 포함)
            for prop in properties_list:
                if '_distance' in prop and prop['_distance'] is not None:
                    prop['_distance'] = float(prop['_distance'])
            
            # geohash 검색 로깅
            if all([sw_lat, sw_lng, ne_lat, ne_lng]) and geohash_bounds:
                logging.info(f"Geohash 검색: prefix={geohash_bounds['center_prefix']}, 결과={len(properties_list)}개")

            # ✅ 전체 매물 수 조회 (페이지네이션과 무관한 총 개수)
            count_query = f"SELECT COUNT(*) as total_count FROM sswp_maemul WHERE {where_clause}"
            count_params = {f'param_{i}': p for i, p in enumerate(params)}
            total_count = conn.execute(text(count_query), count_params).fetchone()[0]

            return jsonify({
                'success': True,
                'count': len(properties_list),
                'total_count': total_count,
                'filters': filters,
                'geohash_used': bool(geohash_bounds),
                'data': properties_list
            })
        
    except Exception as e:
        logging.error(f"매물 목록 조회 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

@bp.route('/property/<int:property_id>')
def get_property_detail(property_id):
    """매물 상세정보 조회"""
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text('''
                    SELECT *
                    FROM sswp_maemul
                    WHERE idx = :property_id
                      AND COALESCE(is_deleted, 0) = 0
                '''),
                {'property_id': property_id}
            )
            property_data = result.fetchone()
            
            if not property_data:
                return jsonify({'success': False, 'error': '매물을 찾을 수 없습니다'}), 404
            
            return jsonify({
                'success': True,
                'data': dict(property_data._mapping)
            })
            
    except Exception as e:
        logging.error(f"매물 상세 조회 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

@bp.route('/search/suggest')
def search_suggest():
    """지역명/역명 검색 자동완성 API"""
    query = request.args.get('q', '').strip()
    
    if not query or len(query) < 2:
        return jsonify({'locations': [], 'stations': []})
    
    try:
        with engine.connect() as conn:
            # DB에서 dong 컬럼 검색 (DISTINCT dong만으로 그룹핑, 중복 제거)
            result = conn.execute(
                text("""
                    SELECT si, gu, dong,
                           COUNT(*) as property_count
                    FROM sswp_maemul 
                    WHERE state = '등록' 
                    AND COALESCE(is_deleted, 0) = 0
                    AND (contract IS NULL OR contract = '' OR contract = '계약가능')
                    AND ldate >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                    AND dong LIKE :query
                    GROUP BY si, gu, dong
                    HAVING property_count > 0
                    ORDER BY property_count DESC
                    LIMIT 10
                """), 
                {'query': f'%{query}%'}
            )
            
            locations = []
            for row in result.fetchall():
                row_dict = dict(row._mapping)
                # 지역명 형식: "충남 천안시 서북구 두정동"
                location_name = row_dict['dong']
                full_address = f"{row_dict['si']} {row_dict['gu']} {row_dict['dong']}"
                
                locations.append({
                    'name': location_name,
                    'dong': row_dict['dong'],
                    'ri': '',
                    'full_address': full_address,
                    'property_count': row_dict['property_count'],
                    'type': 'location'
                })
            
            return jsonify({
                'locations': locations,
                'stations': []  # 역 정보는 클라이언트에서 정적으로 처리
            })
            
    except Exception as e:
        logging.error(f"검색 자동완성 오류: {e}")
        return jsonify({'locations': [], 'stations': []})

@bp.route('/search')
def search_properties():
    """매물 검색 API - 매물번호 검색"""
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify([])
    
    try:
        with engine.connect() as conn:
            # 숫자로만 구성된 매물번호 검색 (자릿수 제한 없음)
            if query.isdigit():
                result = conn.execute(
                    text('''
                        SELECT *
                        FROM sswp_maemul
                        WHERE code = :query
                          AND COALESCE(is_deleted, 0) = 0
                    '''),
                    {'query': query}
                )
                properties = result.fetchall()
                results = [dict(prop._mapping) for prop in properties]
                return jsonify(results)
            else:
                # 숫자가 아니면 빈 결과 반환
                return jsonify([])
            
    except Exception as e:
        logging.error(f"검색 오류: {e}")
        return jsonify([])

@bp.route('/stats')
def get_stats():
    """DB 통계 정보"""
    try:
        with engine.connect() as conn:
            # 전체 매물 수
            result = conn.execute(text("""
                SELECT COUNT(*) as total
                FROM sswp_maemul
                WHERE COALESCE(is_deleted, 0) = 0
            """))
            total_count = result.fetchone()[0]
            
            # 활성 매물 수
            result = conn.execute(text("""
                SELECT COUNT(*) as active FROM sswp_maemul 
                WHERE state = '등록' 
                AND COALESCE(is_deleted, 0) = 0
                AND (contract IS NULL OR contract = '' OR contract = '계약가능')
            """))
            active_count = result.fetchone()[0]
            
            # 최근 업데이트 시간
            result = conn.execute(text("""
                SELECT MAX(ldate) as last_update
                FROM sswp_maemul
                WHERE COALESCE(is_deleted, 0) = 0
            """))
            last_update = result.fetchone()[0]
            
            # 지역별 통계
            result = conn.execute(text("""
                SELECT si, gu, COUNT(*) as count 
                FROM sswp_maemul 
                WHERE state = '등록' 
                AND COALESCE(is_deleted, 0) = 0
                AND (contract IS NULL OR contract = '' OR contract = '계약가능')
                GROUP BY si, gu 
                ORDER BY count DESC 
                LIMIT 10
            """))
            area_stats = [dict(row._mapping) for row in result.fetchall()]
            
            # 카테고리별 통계
            result = conn.execute(text("""
                SELECT category, COUNT(*) as count
                FROM sswp_maemul
                WHERE state = '등록' 
                AND COALESCE(is_deleted, 0) = 0
                AND (contract IS NULL OR contract = '' OR contract = '계약가능')
                GROUP BY category
                ORDER BY count DESC
            """))
            category_stats = [dict(row._mapping) for row in result.fetchall()]
            
            return jsonify({
                'success': True,
                'total_properties': total_count,
                'active_properties': active_count,
                'last_update': str(last_update) if last_update else None,
                'area_stats': area_stats,
                'category_stats': category_stats
            })
        
    except Exception as e:
        logging.error(f"통계 조회 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500


@bp.route('/nearby-places')
def get_nearby_places():
    """
    주변 시설 검색 (카카오 Local API + TAGO API)
    
    쿼리 파라미터:
    - lat: 위도
    - lng: 경도  
    - category: 카테고리 (bus|convenience|laundry|bank|mart|cafe)
    - radius: 검색 반경 (미터, 기본값 500)
    
    버스정류장(bus)은 TAGO API, 나머지는 카카오 API 사용
    """
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        category = request.args.get('category', '')
        radius = request.args.get('radius', 500, type=int)
        
        if not lat or not lng:
            return jsonify({'success': False, 'error': '위도/경도가 필요합니다'}), 400
        
        # 버스 카테고리는 TAGO API로 처리
        if category == BUS_CATEGORY:
            return get_nearby_bus_stops_tago(lat, lng, radius)
        
        # 나머지 카테고리는 카카오 API로 처리
        if category not in POI_CATEGORIES:
            return jsonify({'success': False, 'error': f'지원하지 않는 카테고리입니다. 지원: {list(POI_CATEGORIES.keys()) + [BUS_CATEGORY]}'}), 400
        
        if not KAKAO_REST_API_KEY:
            return jsonify({'success': False, 'error': '카카오 API 키가 설정되지 않았습니다'}), 500
        
        # 검색 키워드
        search_query = POI_CATEGORIES[category]
        
        # 카카오 키워드 장소 검색 API 호출
        # 좌표 + 반경 기반 검색 지원!
        headers = {
            'Authorization': f'KakaoAK {KAKAO_REST_API_KEY}'
        }
        
        params = {
            'query': search_query,
            'x': lng,  # 경도 (카카오는 x=lng, y=lat)
            'y': lat,  # 위도
            'radius': radius,  # 반경 (미터, 최대 20000)
            'size': 15,  # 한 페이지 결과 수 (최대 15)
            'sort': 'distance'  # 거리순 정렬
        }
        
        places = []
        
        # 최대 3페이지까지 조회 (최대 45개)
        for page in range(1, 4):
            params['page'] = page
            
            response = requests.get(
                'https://dapi.kakao.com/v2/local/search/keyword.json',
                headers=headers,
                params=params,
                timeout=5
            )
            
            if response.status_code != 200:
                logging.error(f"카카오 API 오류: {response.status_code} - {response.text}")
                if page == 1:
                    return jsonify({'success': False, 'error': f'카카오 API 오류: {response.status_code}'}), 500
                break
            
            data = response.json()
            documents = data.get('documents', [])
            
            if not documents:
                break
            
            for item in documents:
                try:
                    place_lat = float(item.get('y', 0))
                    place_lng = float(item.get('x', 0))
                    distance_str = item.get('distance', '0')
                    distance = int(distance_str) if distance_str else 0
                    
                    places.append({
                        'title': item.get('place_name', ''),
                        'address': item.get('address_name', ''),
                        'roadAddress': item.get('road_address_name', ''),
                        'lat': place_lat,
                        'lng': place_lng,
                        'distance': distance,
                        'category': category,
                        'phone': item.get('phone', ''),
                        'place_url': item.get('place_url', '')
                    })
                except (ValueError, TypeError) as e:
                    logging.warning(f"장소 데이터 파싱 오류: {e}")
                    continue
            
            # 마지막 페이지인지 확인
            meta = data.get('meta', {})
            if meta.get('is_end', True):
                break
        
        return jsonify({
            'success': True,
            'category': category,
            'categoryName': POI_CATEGORIES[category],
            'center': {'lat': lat, 'lng': lng},
            'radius': radius,
            'count': len(places),
            'places': places
        })
        
    except requests.exceptions.Timeout:
        logging.error("카카오 API 타임아웃")
        return jsonify({'success': False, 'error': 'API 요청 타임아웃'}), 504
    except Exception as e:
        logging.error(f"주변 시설 검색 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500


def get_nearby_bus_stops_tago(lat, lng, radius=500):
    """
    로컬 데이터에서 주변 버스정류장 검색 (TAGO API 대체)
    
    Args:
        lat: 위도
        lng: 경도
        radius: 검색 반경 (미터, 기본값 500)
    
    Returns:
        JSON 응답
    """
    try:
        # 로컬 데이터 로드
        bus_data = load_bus_data()
        
        if not bus_data:
            # 로컬 데이터 없으면 TAGO API 폴백
            return get_nearby_bus_stops_tago_api(lat, lng, radius)
        
        stops = bus_data.get('stops', [])
        bus_stops = []
        
        for stop in stops:
            try:
                stop_lat = stop.get('lat', 0)
                stop_lng = stop.get('lng', 0)
                
                if stop_lat == 0 or stop_lng == 0:
                    continue
                
                # 거리 계산
                distance = haversine_distance(lat, lng, stop_lat, stop_lng)
                
                # 반경 필터링
                if distance <= radius:
                    bus_stops.append({
                        'title': stop.get('nodenm', '버스정류장'),
                        'nodeid': stop.get('nodeid', ''),
                        'nodeno': stop.get('nodeno', ''),
                        'address': '',
                        'roadAddress': '',
                        'lat': stop_lat,
                        'lng': stop_lng,
                        'distance': int(distance),
                        'category': 'bus',
                        'citycode': '34010',
                        'routes': stop.get('routes', [])  # 노선 정보 포함
                    })
            except (ValueError, TypeError) as e:
                continue
        
        # 거리순 정렬
        bus_stops.sort(key=lambda x: x['distance'])
        
        return jsonify({
            'success': True,
            'category': 'bus',
            'categoryName': '버스정류장',
            'center': {'lat': lat, 'lng': lng},
            'radius': radius,
            'count': len(bus_stops),
            'places': bus_stops,
            'source': 'local'  # 데이터 출처 표시
        })
        
    except Exception as e:
        logging.error(f"버스정류장 검색 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500


def get_nearby_bus_stops_tago_api(lat, lng, radius=500):
    """
    TAGO API를 사용하여 주변 버스정류장 검색 (폴백용)
    로컬 데이터가 없을 때만 호출됨
    """
    import xml.etree.ElementTree as ET
    
    if not TAGO_API_KEY:
        return jsonify({'success': False, 'error': 'TAGO API 키가 설정되지 않았습니다.'}), 500
    
    try:
        url = 'http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList'
        
        params = {
            'serviceKey': TAGO_API_KEY,
            'gpsLati': lat,
            'gpsLong': lng,
            'numOfRows': 100,
            'pageNo': 1
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code != 200:
            return jsonify({'success': False, 'error': f'TAGO API 오류: {response.status_code}'}), 500
        
        root = ET.fromstring(response.content)
        result_code = root.findtext('.//resultCode')
        if result_code and result_code != '00':
            result_msg = root.findtext('.//resultMsg', 'Unknown error')
            return jsonify({'success': False, 'error': f'TAGO API 에러: {result_msg}'}), 500
        
        items = root.findall('.//item')
        bus_stops = []
        
        for item in items:
            try:
                stop_lat = float(item.findtext('gpslati', 0))
                stop_lng = float(item.findtext('gpslong', 0))
                
                if stop_lat == 0 or stop_lng == 0:
                    continue
                
                distance = haversine_distance(lat, lng, stop_lat, stop_lng)
                
                if distance <= radius:
                    bus_stops.append({
                        'title': item.findtext('nodenm', '버스정류장'),
                        'nodeid': item.findtext('nodeid', ''),
                        'nodeno': item.findtext('nodeno', ''),
                        'address': '',
                        'roadAddress': '',
                        'lat': stop_lat,
                        'lng': stop_lng,
                        'distance': int(distance),
                        'category': 'bus',
                        'citycode': item.findtext('citycode', '')
                    })
            except (ValueError, TypeError):
                continue
        
        bus_stops.sort(key=lambda x: x['distance'])
        
        return jsonify({
            'success': True,
            'category': 'bus',
            'categoryName': '버스정류장',
            'center': {'lat': lat, 'lng': lng},
            'radius': radius,
            'count': len(bus_stops),
            'places': bus_stops,
            'source': 'tago_api'
        })
        
    except requests.exceptions.Timeout:
        return jsonify({'success': False, 'error': 'API 요청 타임아웃'}), 504
    except Exception as e:
        logging.error(f"TAGO API 버스정류장 검색 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500


@bp.route('/bus-routes')
def get_bus_routes_at_stop():
    """
    특정 버스정류장을 지나는 노선 목록 조회 (로컬 데이터 우선)
    
    쿼리 파라미터:
    - nodeid: 정류장 ID
    - citycode: 도시코드 (기본값: 34010 - 천안시)
    """
    nodeid = request.args.get('nodeid', '')
    citycode = request.args.get('citycode', '34010')
    
    if not nodeid:
        return jsonify({'success': False, 'error': '정류장 ID가 필요합니다'}), 400
    
    try:
        # 로컬 데이터에서 먼저 조회
        bus_data = load_bus_data()
        
        if bus_data:
            stops = bus_data.get('stops', [])
            
            # nodeid로 정류소 찾기
            for stop in stops:
                if stop.get('nodeid') == nodeid:
                    routes = stop.get('routes', [])
                    
                    # 노선번호 순으로 정렬
                    routes_sorted = sorted(
                        routes,
                        key=lambda x: int(x['routeno']) if x.get('routeno', '').isdigit() else 999
                    )
                    
                    return jsonify({
                        'success': True,
                        'nodeid': nodeid,
                        'count': len(routes_sorted),
                        'routes': routes_sorted,
                        'source': 'local'
                    })
            
            # 로컬 데이터에 없으면 빈 결과 반환 (API 호출 안함)
            return jsonify({
                'success': True,
                'nodeid': nodeid,
                'count': 0,
                'routes': [],
                'source': 'local'
            })
        
        # 로컬 데이터 없으면 TAGO API 폴백
        return get_bus_routes_at_stop_api(nodeid, citycode)
        
    except Exception as e:
        logging.error(f"경유노선 조회 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500


def get_bus_routes_at_stop_api(nodeid, citycode='34010'):
    """
    TAGO API를 사용하여 경유 노선 조회 (폴백용)
    """
    import xml.etree.ElementTree as ET
    
    if not TAGO_API_KEY:
        return jsonify({'success': False, 'error': 'TAGO API 키가 설정되지 않았습니다'}), 500
    
    try:
        url = 'http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList'
        
        params = {
            'serviceKey': TAGO_API_KEY,
            'cityCode': citycode,
            'nodeid': nodeid,
            'numOfRows': 50,
            'pageNo': 1
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code != 200:
            return jsonify({'success': False, 'error': f'API 오류: {response.status_code}'}), 500
        
        root = ET.fromstring(response.content)
        result_code = root.findtext('.//resultCode')
        if result_code and result_code != '00':
            result_msg = root.findtext('.//resultMsg', 'Unknown error')
            return jsonify({'success': False, 'error': result_msg}), 500
        
        items = root.findall('.//item')
        routes = []
        
        for item in items:
            routes.append({
                'routeno': item.findtext('routeno', ''),
                'routeid': item.findtext('routeid', ''),
                'routetp': item.findtext('routetp', ''),
                'startnodenm': item.findtext('startnodenm', ''),
                'endnodenm': item.findtext('endnodenm', '')
            })
        
        routes.sort(key=lambda x: int(x['routeno']) if x['routeno'].isdigit() else 999)
        
        return jsonify({
            'success': True,
            'nodeid': nodeid,
            'count': len(routes),
            'routes': routes,
            'source': 'tago_api'
        })
        
    except requests.exceptions.Timeout:
        return jsonify({'success': False, 'error': 'API 타임아웃'}), 504
    except Exception as e:
        logging.error(f"TAGO API 경유노선 조회 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500


# ============ 추천 매물 / 테마별 매물 API ============

# 추천 매물 유형 정의
RECOMMEND_TYPES = {
    'today': {'label': '오늘의 추천 매물', 'column': 'good6', 'time_filter': True},
    'good1': {'label': '신축 고급형 추천 매물', 'column': 'good1'},
    'good4': {'label': '알뜰 실속형 추천 매물', 'column': 'good4'},
    'good2': {'label': '원룸 추천 매물', 'column': 'good2'},
    'good5': {'label': '투베이 추천 매물', 'column': 'good5'},
    'good7': {'label': '투룸/쓰리룸 추천 매물', 'column': 'good7'},
}

# 테마별 매물 유형 정의
THEMA_TYPES = {
    'thema1': {'label': '신축 고급형', 'column': 'thema1'},
    'thema14': {'label': '실시간 추천', 'column': 'thema14'},
    'thema9': {'label': '알뜰 실속형 원룸', 'column': 'thema9'},
    'thema10': {'label': '알뜰 실속형 투베이/투룸', 'column': 'thema10'},
    'thema2': {'label': '보증금 100가능', 'column': 'thema2'},
    'thema8': {'label': '큰 원룸', 'column': 'thema8'},
    'thema11': {'label': '주방/베란다 분리형 원룸', 'column': 'thema11'},
    'thema4': {'label': '아치형 투베이', 'column': 'thema4'},
    'thema12': {'label': '거실 분리형 투베이', 'column': 'thema12'},
    'thema13': {'label': '넓은 거실형 투룸', 'column': 'thema13'},
    'thema5': {'label': '독특한 스타일의 집', 'column': 'thema5'},
}

@bp.route('/recommend-properties')
def get_recommend_properties():
    """
    추천 매물 / 테마별 매물 조회 API
    
    쿼리 파라미터:
    - type: 추천 유형 (today, good1, good2, good4, good5, good7, thema1~thema14)
    - limit: 최대 결과 수 (기본값 100)
    """
    try:
        recommend_type = request.args.get('type', '')
        limit = request.args.get('limit', 100, type=int)
        
        if not recommend_type:
            return jsonify({'success': False, 'error': 'type 파라미터가 필요합니다'}), 400
        
        # 추천 유형 확인
        type_info = RECOMMEND_TYPES.get(recommend_type) or THEMA_TYPES.get(recommend_type)
        
        if not type_info:
            return jsonify({'success': False, 'error': f'지원하지 않는 유형입니다: {recommend_type}'}), 400
        
        column = type_info['column']
        label = type_info['label']
        time_filter = type_info.get('time_filter', False)
        
        with engine.connect() as conn:
            # 기본 조건: 등록 상태, 계약 가능, 추천 컬럼 조건
            where_conditions = [
                "state = '등록'",
                "COALESCE(is_deleted, 0) = 0",
                "(contract IS NULL OR contract = '' OR contract = '계약가능')",
                f"{column} = 1"  # ✅ 추천 매물 컬럼 조건 (예: good6 = 1)
            ]
            
            where_clause = " AND ".join(where_conditions)
            
            query = f"""
                SELECT idx, code, category, si, gu, dong, ri, title, 
                       lat, lng, geohash, size, maemae_money, jen_money, traffice,
                       security_money, month_money, public_money, now_floor,
                       picname1, ldate, state, contract, movie
                FROM sswp_maemul 
                WHERE {where_clause}
                ORDER BY ldate DESC
                LIMIT :limit
            """
            
            result = conn.execute(text(query), {'limit': limit})
            properties = result.fetchall()
            
            properties_list = [dict(row._mapping) for row in properties]
            
            return jsonify({
                'success': True,
                'type': recommend_type,
                'label': label,
                'count': len(properties_list),
                'data': properties_list
            })
            
    except Exception as e:
        logging.error(f"추천 매물 조회 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'internal_server_error'}), 500

# ── 사용자 찜 목록 API ────────────────────────────────────────

@bp.route('/user/liked', methods=['GET'])
def user_liked_list():
    """로그인 사용자의 찜 목록 코드 배열 반환"""
    if 'user_idx' not in session:
        return jsonify({'success': False, 'error': 'not_logged_in'}), 401

    with engine.connect() as conn:
        rows = conn.execute(
            text('SELECT code FROM user_liked WHERE user_idx = :uid ORDER BY created_at DESC'),
            {'uid': session['user_idx']}
        ).fetchall()
    codes = [r[0] for r in rows]
    return jsonify({'success': True, 'codes': codes})


@bp.route('/user/liked/sync', methods=['POST'])
def user_liked_sync():
    """
    localStorage 찜 목록을 서버 DB와 병합.
    요청 body: { "codes": ["1234", "5678", ...] }
    응답: 병합된 전체 찜 목록 코드 배열
    """
    if 'user_idx' not in session:
        return jsonify({'success': False, 'error': 'not_logged_in'}), 401

    data  = request.get_json(silent=True) or {}
    codes = data.get('codes', [])
    uid   = session['user_idx']

    with engine.begin() as conn:
        # 1) 클라이언트에서 넘어온 코드들을 DB에 INSERT IGNORE (중복 무시)
        for code in codes:
            if code:
                conn.execute(
                    text('INSERT IGNORE INTO user_liked (user_idx, code) VALUES (:uid, :code)'),
                    {'uid': uid, 'code': str(code)}
                )
        # 2) 병합 후 전체 찜 목록 반환
        rows = conn.execute(
            text('SELECT code FROM user_liked WHERE user_idx = :uid ORDER BY created_at DESC'),
            {'uid': uid}
        ).fetchall()

    merged = [r[0] for r in rows]
    return jsonify({'success': True, 'codes': merged})


@bp.route('/user/liked/toggle', methods=['POST'])
def user_liked_toggle():
    """
    단일 매물 찜 토글 (로그인 사용자).
    요청 body: { "code": "1234" }
    응답: { "liked": true/false }
    """
    if 'user_idx' not in session:
        return jsonify({'success': False, 'error': 'not_logged_in'}), 401

    code = (request.get_json(silent=True) or {}).get('code', '')
    uid  = session['user_idx']

    with engine.begin() as conn:
        row = conn.execute(
            text('SELECT idx FROM user_liked WHERE user_idx=:uid AND code=:code'),
            {'uid': uid, 'code': code}
        ).fetchone()
        if row:
            conn.execute(
                text('DELETE FROM user_liked WHERE user_idx=:uid AND code=:code'),
                {'uid': uid, 'code': code}
            )
            return jsonify({'success': True, 'liked': False})
        else:
            conn.execute(
                text('INSERT IGNORE INTO user_liked (user_idx, code) VALUES (:uid, :code)'),
                {'uid': uid, 'code': code}
            )
            return jsonify({'success': True, 'liked': True})


# ── 사용자 최근 본 매물 API ───────────────────────────────────

@bp.route('/user/recent/add', methods=['POST'])
def user_recent_add():
    """매물 조회 시 최근 본 매물 DB 기록 (로그인 사용자만)."""
    if 'user_idx' not in session:
        return jsonify({'success': False, 'error': 'not_logged_in'}), 401

    code = (request.get_json(silent=True) or {}).get('code', '')
    if not code:
        return jsonify({'success': False, 'error': 'missing_code'}), 400

    uid = session['user_idx']
    with engine.begin() as conn:
        # 이미 있으면 viewed_at 갱신, 없으면 새 행 삽입
        conn.execute(
            text('''
                INSERT INTO user_recent (user_idx, code, viewed_at)
                VALUES (:uid, :code, NOW())
                ON DUPLICATE KEY UPDATE viewed_at = NOW()
            '''),
            {'uid': uid, 'code': str(code)}
        )
        # 50개 초과 시 오래된 것 삭제
        conn.execute(
            text('''
                DELETE FROM user_recent
                WHERE user_idx = :uid
                  AND idx NOT IN (
                      SELECT idx FROM (
                          SELECT idx FROM user_recent
                          WHERE user_idx = :uid
                          ORDER BY viewed_at DESC
                          LIMIT 50
                      ) sub
                  )
            '''),
            {'uid': uid}
        )
    return jsonify({'success': True})


@bp.route('/user/recent/delete', methods=['POST'])
def user_recent_delete():
    """최근 본 매물 개별 삭제."""
    if 'user_idx' not in session:
        return jsonify({'success': False, 'error': 'not_logged_in'}), 401

    code = (request.get_json(silent=True) or {}).get('code', '')
    uid  = session['user_idx']
    with engine.begin() as conn:
        conn.execute(
            text('DELETE FROM user_recent WHERE user_idx=:uid AND code=:code'),
            {'uid': uid, 'code': str(code)}
        )
    return jsonify({'success': True})


@bp.route('/user/recent/clear', methods=['POST'])
def user_recent_clear():
    """최근 본 매물 전체 삭제."""
    if 'user_idx' not in session:
        return jsonify({'success': False, 'error': 'not_logged_in'}), 401

    uid = session['user_idx']
    with engine.begin() as conn:
        conn.execute(
            text('DELETE FROM user_recent WHERE user_idx=:uid'),
            {'uid': uid}
        )
    return jsonify({'success': True})
