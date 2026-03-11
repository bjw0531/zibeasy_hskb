# HouseKB 서비스 관리 명령어

## 🚀 기본 명령어

### 서비스 상태 확인
```bash
sudo systemctl status housekb
```

### 서비스 시작
```bash
sudo systemctl start housekb
```

### 서비스 중지
```bash
sudo systemctl stop housekb
```

### 서비스 재시작
```bash
sudo systemctl restart housekb
```

### 서비스 자동 시작 활성화
```bash
sudo systemctl enable housekb
```

### 서비스 자동 시작 비활성화
```bash
sudo systemctl disable housekb
```

## 📊 로그 확인

### ⭐ 실시간 앱 상세 로그 (DB 쿼리, 파일 전송, 매물 동기화 등)
```bash
tail -f /home/ubuntu/housekb/logs/app.log
```

### 실시간 접속 로그 확인 (API 호출, 지도 움직임 등)
```bash
tail -f /home/ubuntu/housekb/logs/gunicorn_access.log
```

### 실시간 에러 로그 확인
```bash
tail -f /home/ubuntu/housekb/logs/gunicorn_error.log
```

### 모든 로그 동시에 확인
```bash
tail -f /home/ubuntu/housekb/logs/gunicorn_*.log
```

### 최근 접속 로그 확인 (최근 50줄)
```bash
tail -n 50 /home/ubuntu/housekb/logs/gunicorn_access.log
```

### systemd 서비스 로그 확인
```bash
# 실시간 서비스 로그
sudo journalctl -u housekb -f

# 최근 서비스 로그
sudo journalctl -u housekb -n 50

# 오늘 서비스 로그
sudo journalctl -u housekb --since today
```

## 🔧 서비스 파일 수정 후

### 서비스 파일 수정 후 적용
```bash
sudo systemctl daemon-reload
sudo systemctl restart housekb
```

## 🎯 유용한 명령어

### 서비스가 활성화되어 있는지 확인
```bash
sudo systemctl is-enabled housekb
```

### 서비스가 실행 중인지 확인
```bash
sudo systemctl is-active housekb
```

### 프로세스 확인
```bash
ps aux | grep gunicorn
```

### 포트 사용 확인
```bash
sudo lsof -i:5002
```

## 🚨 문제 해결

### 서비스가 시작되지 않을 때
```bash
# 상세 로그 확인
sudo journalctl -u housekb -xe

# 서비스 파일 문법 확인
sudo systemd-analyze verify /etc/systemd/system/housekb.service
```

### 서비스 강제 재시작
```bash
sudo systemctl stop housekb
sudo pkill -9 -f gunicorn
sudo systemctl start housekb
```

## ✅ 현재 상태

- **서비스 이름**: housekb
- **WSGI 서버**: Gunicorn
- **포트**: 5002 (127.0.0.1:5002)
- **워커 수**: 4개
- **스레드 수**: 워커당 2개
- **자동 시작**: 활성화됨
- **재시작 정책**: 항상 (10초 후 자동 재시작)
- **로그 위치**:
  - `/home/ubuntu/housekb/logs/app.log` (앱 상세 로그 - DB, 파일 전송 등)
  - `/home/ubuntu/housekb/logs/gunicorn_access.log` (접속 로그)
  - `/home/ubuntu/housekb/logs/gunicorn_error.log` (에러 로그)

## 🎉 특징

- ✅ Gunicorn으로 동시 접속자 150~200명 처리 가능
- ✅ 서버 재부팅 시 자동 시작
- ✅ 프로세스 종료 시 10초 후 자동 재시작
- ✅ MySQL 서비스 시작 후 실행
- ✅ 로그 자동 기록
- ✅ 워커 1000회 요청 후 자동 재시작 (메모리 누수 방지)
- ✅ 365일 24시간 안정적인 운영

## 🧹 개인정보 자동 파기 배치

### 수동 실행
```bash
cd /home/ubuntu/housekb
python3 scripts/privacy_cleanup.py
```

### cron 등록 예시 (매일 새벽 3시)
```bash
crontab -e
```

```cron
0 3 * * * cd /home/ubuntu/housekb && /usr/bin/python3 scripts/privacy_cleanup.py >> /home/ubuntu/housekb/logs/privacy_cleanup.log 2>&1
```




