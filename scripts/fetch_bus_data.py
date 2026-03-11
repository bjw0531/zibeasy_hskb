#!/usr/bin/env python3
"""
천안시 버스정류소 및 경유노선 데이터 수집 스크립트

TAGO API를 사용하여 천안시 전체 버스정류소 목록과 
각 정류소별 경유 노선 정보를 수집하여 JSON 파일로 저장합니다.

실행: python scripts/fetch_bus_data.py
"""

import os
import sys
import json
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# 프로젝트 루트 경로
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# .env 파일에서 API 키 로드
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / '.env')

TAGO_API_KEY = os.environ.get('TAGO_API_KEY', '')
CITY_CODE = '34010'  # 천안시 도시코드
CITY_NAME = '천안시'

# API 엔드포인트
BUS_STOP_LIST_URL = 'http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList'
BUS_ROUTE_LIST_URL = 'http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList'

# 저장 경로
OUTPUT_FILE = PROJECT_ROOT / 'data' / 'bus_stops_cheonan.json'


def fetch_all_bus_stops():
    """천안시 전체 버스정류소 목록 조회"""
    print(f"🚌 {CITY_NAME} 버스정류소 목록 조회 시작...")
    
    all_stops = []
    page = 1
    num_of_rows = 1000  # 한 페이지당 최대 개수
    
    while True:
        params = {
            'serviceKey': TAGO_API_KEY,
            'cityCode': CITY_CODE,
            'numOfRows': num_of_rows,
            'pageNo': page
        }
        
        try:
            response = requests.get(BUS_STOP_LIST_URL, params=params, timeout=30)
            response.raise_for_status()
            
            root = ET.fromstring(response.content)
            
            # 에러 체크
            result_code = root.findtext('.//resultCode')
            if result_code != '00':
                result_msg = root.findtext('.//resultMsg', 'Unknown error')
                print(f"❌ API 에러: {result_msg}")
                break
            
            items = root.findall('.//item')
            
            if not items:
                break
            
            for item in items:
                try:
                    lat = item.findtext('gpslati')
                    lng = item.findtext('gpslong')
                    
                    # 좌표가 없는 정류소는 제외
                    if not lat or not lng:
                        continue
                    
                    stop = {
                        'nodeid': item.findtext('nodeid', ''),
                        'nodeno': item.findtext('nodeno', ''),
                        'nodenm': item.findtext('nodenm', ''),
                        'lat': float(lat),
                        'lng': float(lng),
                        'routes': []  # 나중에 채움
                    }
                    all_stops.append(stop)
                except (ValueError, TypeError) as e:
                    continue
            
            print(f"  📍 페이지 {page}: {len(items)}개 정류소 수집")
            
            # 더 가져올 데이터가 있는지 확인
            total_count = int(root.findtext('.//totalCount', '0'))
            if page * num_of_rows >= total_count:
                break
            
            page += 1
            time.sleep(0.3)  # API 호출 간격
            
        except requests.exceptions.RequestException as e:
            print(f"❌ 요청 오류: {e}")
            break
        except ET.ParseError as e:
            print(f"❌ XML 파싱 오류: {e}")
            break
    
    print(f"✅ 총 {len(all_stops)}개 정류소 수집 완료")
    return all_stops


def fetch_routes_for_stop(nodeid):
    """특정 정류소의 경유 노선 목록 조회"""
    params = {
        'serviceKey': TAGO_API_KEY,
        'cityCode': CITY_CODE,
        'nodeid': nodeid,
        'numOfRows': 100,
        'pageNo': 1
    }
    
    try:
        response = requests.get(BUS_ROUTE_LIST_URL, params=params, timeout=10)
        response.raise_for_status()
        
        root = ET.fromstring(response.content)
        
        result_code = root.findtext('.//resultCode')
        if result_code != '00':
            return []
        
        items = root.findall('.//item')
        routes = []
        
        for item in items:
            route = {
                'routeno': item.findtext('routeno', ''),
                'routeid': item.findtext('routeid', ''),
                'routetp': item.findtext('routetp', '')
            }
            routes.append(route)
        
        return routes
        
    except Exception as e:
        return []


def fetch_all_routes(stops):
    """모든 정류소의 경유 노선 수집"""
    total = len(stops)
    print(f"\n🚍 {total}개 정류소의 경유 노선 수집 시작...")
    
    for i, stop in enumerate(stops):
        routes = fetch_routes_for_stop(stop['nodeid'])
        stop['routes'] = routes
        
        # 진행상황 표시 (100개마다)
        if (i + 1) % 100 == 0 or i + 1 == total:
            progress = (i + 1) / total * 100
            print(f"  🔄 진행: {i + 1}/{total} ({progress:.1f}%)")
        
        # API 호출 간격 (초당 약 10회 = 0.1초 간격)
        time.sleep(0.1)
    
    print(f"✅ 노선 정보 수집 완료")


def save_to_json(stops):
    """JSON 파일로 저장"""
    data = {
        'metadata': {
            'citycode': CITY_CODE,
            'city': CITY_NAME,
            'updated_at': datetime.now().isoformat(),
            'total_stops': len(stops)
        },
        'stops': stops
    }
    
    # 디렉토리 생성
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    file_size = OUTPUT_FILE.stat().st_size / 1024
    print(f"\n💾 저장 완료: {OUTPUT_FILE}")
    print(f"   파일 크기: {file_size:.1f} KB")


def main():
    if not TAGO_API_KEY:
        print("❌ TAGO_API_KEY가 설정되지 않았습니다.")
        print("   .env 파일에 TAGO_API_KEY를 추가해주세요.")
        sys.exit(1)
    
    print("=" * 50)
    print(f"🚌 {CITY_NAME} 버스 데이터 수집기")
    print("=" * 50)
    
    # 1. 정류소 목록 수집
    stops = fetch_all_bus_stops()
    
    if not stops:
        print("❌ 정류소 데이터를 가져오지 못했습니다.")
        sys.exit(1)
    
    # 2. 각 정류소별 경유 노선 수집
    fetch_all_routes(stops)
    
    # 3. JSON 저장
    save_to_json(stops)
    
    # 4. 통계 출력
    total_routes = sum(len(s['routes']) for s in stops)
    stops_with_routes = sum(1 for s in stops if s['routes'])
    
    print("\n📊 수집 통계:")
    print(f"   - 총 정류소: {len(stops)}개")
    print(f"   - 노선 있는 정류소: {stops_with_routes}개")
    print(f"   - 총 노선 매핑: {total_routes}개")
    print("\n✅ 완료!")


if __name__ == '__main__':
    main()
