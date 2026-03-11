# HouseKB

천안 지역 임대 매물 플랫폼 **천안하우스**를 현대 웹 환경에 맞게 다시 구축한 프로젝트입니다.  
이 서비스는 **2008년에 제작된 기존 천안하우스를 운영 경험째로 계승**하면서, 지도 기반 탐색, 모바일 UX, 운영 효율, 유지보수성을 중심으로 새롭게 정리한 마이그레이션 프로젝트입니다.

---

## 왜 다시 만들었나

기존 천안하우스는 오랜 기간 실제 현장에서 쓰이며 검증된 서비스였습니다.  
하지만 시간이 지나며 다음 문제들이 커졌습니다.

- 모바일 사용성 한계
- 레거시 구조로 인한 기능 확장 부담
- 운영자 반복 업무 증가
- 최신 브라우저/배포 환경 대응 부족

HouseKB는 단순 리디자인이 아니라, **기존 서비스의 실전 감각은 유지하고 구현 방식은 현대화**하는 데 목적이 있습니다.

즉, 이 프로젝트는:

- 버리는 재개발이 아니라
- 현업에서 검증된 흐름을 살리고
- 필요한 부분만 재구성한
- 실무형 마이그레이션입니다

---

## 핵심 목표

- 천안 임대 매물을 더 빠르고 직관적으로 찾게 한다
- 모바일에서 더 편하게 탐색하게 한다
- 관심목록, 최근 본 매물, 상세 보기 흐름을 매끄럽게 만든다
- 운영자가 매물 관리와 고객 대응을 더 효율적으로 하게 한다
- 기존 비즈니스 로직을 함부로 깨지 않고 안전하게 개선한다

---

## 주요 기능

### 사용자 기능

- 지도 기반 매물 탐색
- 리스트 기반 매물 탐색
- 매물 상세 페이지
- 관심목록
- 최근 본 매물
- 가격/옵션/구조/위치 기반 필터링
- 카카오/네이버 로그인
- 공유, 문의, 주변 정보 확인

### 운영 기능

- 관리자 매물 등록/수정/삭제
- 회원 관리
- 차단 관리
- 피드백/문의 관리
- 개인정보 정리 배치 스크립트
- 서비스 로그 및 운영 명령 분리

---

## 서비스 구조

HouseKB는 Flask 기반 서버 렌더링 웹앱이며, 운영 환경에서는 Gunicorn + systemd 조합으로 구동됩니다.

### 주요 페이지

- `/` : 홈
- `/map` : 지도 탐색
- `/list` : 목록 탐색
- `/view/<code>` : 매물 상세
- `/liked` : 관심목록
- `/recents` : 최근 본 매물
- `/profile` : 프로필

### 운영 실행 구조

- App Server: Flask
- WSGI: Gunicorn
- Process Manager: systemd
- Database: MySQL
- Frontend: Jinja2 + Vanilla JS + TailwindCSS

---

## 기술 스택

### Backend

- Python 3
- Flask
- SQLAlchemy
- PyMySQL
- Gunicorn

### Frontend

- Jinja2
- Vanilla JavaScript
- TailwindCSS
- Custom CSS

### Infra / Ops

- systemd
- Nginx
- MySQL

---

## 프로젝트 철학

이 프로젝트는 화려한 기술 시연보다 **실제 부동산 현장에서 오래 쓰일 수 있는 제품**을 지향합니다.

중요하게 보는 기준은 다음과 같습니다.

- 사용자가 매물을 빨리 비교할 수 있는가
- 모바일에서 손쉽게 조작할 수 있는가
- 운영자가 반복 업무를 줄일 수 있는가
- 기존 서비스의 감각과 신뢰를 유지하는가
- 문제가 생겼을 때 빠르게 추적하고 복구할 수 있는가

---

## 디렉터리 개요

```text
housekb/
├── app/                  Flask 앱, 라우트, 유틸리티
├── templates/            Jinja2 템플릿
├── static/               CSS, JS, 이미지, 지도 데이터
├── scripts/              운영/배치 스크립트
├── tests/                테스트 코드
├── fee_calc/             부가 계산기 관련 정적 리소스
├── wsgi.py               Gunicorn WSGI 진입점
├── app.py                개발용 실행 진입점
├── gunicorn_config.py    Gunicorn 설정
├── housekb.service       systemd 서비스 설정
└── SERVICE_COMMANDS.md   운영 명령어 모음
```

---

## 로컬 실행

### 1. 가상환경 준비

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 환경 변수 설정

`.env` 파일을 준비합니다.  
실제 운영 키, DB 접속 정보, OAuth 정보는 저장소에 올리지 않습니다.

예시 항목:

- DB 접속 정보
- Flask secret key
- Kakao / Naver OAuth 설정
- 외부 API 키

### 3. 개발 서버 실행

```bash
python3 app.py
```

또는 Gunicorn 기준으로 확인하려면:

```bash
./venv/bin/gunicorn --config gunicorn_config.py wsgi:app
```

---

## 운영 배포

이 프로젝트는 systemd 서비스로 운영할 수 있게 구성되어 있습니다.

### 서비스 재시작

```bash
sudo systemctl restart housekb
```

### 서비스 상태 확인

```bash
sudo systemctl status housekb
sudo systemctl is-active housekb
```

### 로그 확인

```bash
tail -f /home/ubuntu/housekb/logs/app.log
tail -f /home/ubuntu/housekb/logs/gunicorn_access.log
tail -f /home/ubuntu/housekb/logs/gunicorn_error.log
sudo journalctl -u housekb -f
```

자세한 운영 명령은 [SERVICE_COMMANDS.md](./SERVICE_COMMANDS.md)를 참고하면 됩니다.

---

## 개인정보 / 운영 배치

개인정보 자동 정리 스크립트가 포함되어 있습니다.

수동 실행:

```bash
python3 scripts/privacy_cleanup.py
```

cron 예시:

```cron
0 3 * * * cd /home/ubuntu/housekb && /usr/bin/python3 scripts/privacy_cleanup.py >> /home/ubuntu/housekb/logs/privacy_cleanup.log 2>&1
```

---

## Git 운영 원칙

이 프로젝트는 git으로 관리합니다.

- 작업 단위마다 커밋
- 운영 영향 파일 변경 시 서비스 재시작
- `.env`, 로그, DB 백업, 대용량 산출물은 저장소 제외
- 커밋은 작은 범위로 유지

---

## 현재 프로젝트의 의미

HouseKB는 새로 만든 서비스이면서 동시에,  
오랫동안 천안 지역에서 축적된 **운영 경험과 사용자 흐름을 이어받은 후속 시스템**입니다.

이 프로젝트의 가치는 단순히 "예전 사이트를 옮겼다"에 있지 않습니다.

**2008년의 현장 감각을 2020년대의 웹 기술로 다시 작동하게 만든 것**,  
그게 이 프로젝트의 핵심입니다.

---

## 앞으로의 방향

- 검색과 비교 경험 고도화
- 운영 자동화 확대
- 모바일 상세 UX 개선
- 로그인 사용자 기능 강화
- 레거시 업무 흐름의 점진적 현대화

---

## 한 줄 소개

> HouseKB는 2008년 천안하우스의 실전 경험을 바탕으로,  
> 오늘의 사용자와 운영 환경에 맞게 다시 설계한 천안 임대 매물 플랫폼입니다.
