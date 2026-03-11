"""
Geohash 관련 유틸리티 함수
"""
import geohash2
import logging

def generate_geohash(lat, lng):
    """좌표로부터 geohash 생성"""
    try:
        lat = float(lat) if lat else 0
        lng = float(lng) if lng else 0

        if lat != 0 and lng != 0:
            return geohash2.encode(lat, lng, precision=8)
        return None
    except Exception as e:
        logging.error(f"Geohash 생성 실패: {e}")
        return None

def get_geohash_bounds(sw_lat, sw_lng, ne_lat, ne_lng):
    """화면 영역의 geohash 범위 계산"""
    try:
        # 화면 영역의 네 모서리 geohash 계산
        sw_geohash = geohash2.encode(sw_lat, sw_lng, precision=5)
        ne_geohash = geohash2.encode(ne_lat, ne_lng, precision=5)
        
        # 화면 중심의 geohash prefix (5자리로 확장)
        center_lat = (sw_lat + ne_lat) / 2
        center_lng = (sw_lng + ne_lng) / 2
        center_geohash = geohash2.encode(center_lat, center_lng, precision=5)
        
        return {
            'sw_geohash': sw_geohash,
            'ne_geohash': ne_geohash,
            'center_prefix': center_geohash[:5]  # 5자리 prefix (더 넓은 영역)
        }
    except Exception as e:
        logging.error(f"Geohash 범위 계산 실패: {e}")
        return None