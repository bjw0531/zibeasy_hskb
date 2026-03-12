#!/usr/bin/env python3
"""개인정보 보관기간 만료 데이터 정리 배치.

정리 대상:
- house_request_forms (집 구하기/내놓기 신청)
- feedback_reports (오류 제보/기능 제안)
- feedback_reports 첨부파일(data/feedback_uploads)
- zibeasy_access_log 유입 로그/이동 로그
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import text

from app import create_app
from app import models


ROOT_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = ROOT_DIR / "data" / "feedback_uploads"


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalar()
    return bool(row)


def _safe_remove(path: Path) -> bool:
    try:
        if path.exists() and path.is_file():
            path.unlink()
            return True
    except Exception:
        return False
    return False


def run_cleanup() -> dict[str, int]:
    app = create_app()
    house_days = int(app.config.get("HOUSE_REQUEST_RETENTION_DAYS", 365))
    feedback_days = int(app.config.get("FEEDBACK_RETENTION_DAYS", 365))
    access_entry_days = int(app.config.get("ACCESS_ENTRY_RETENTION_DAYS", 365))
    access_flow_days = int(app.config.get("ACCESS_FLOW_RETENTION_DAYS", 60))
    house_cutoff = datetime.now() - timedelta(days=house_days)
    feedback_cutoff = datetime.now() - timedelta(days=feedback_days)
    access_entry_cutoff = datetime.utcnow() - timedelta(days=access_entry_days)
    access_flow_cutoff = datetime.utcnow() - timedelta(days=access_flow_days)

    result = {
        "house_deleted": 0,
        "feedback_deleted": 0,
        "files_deleted": 0,
        "access_entry_deleted": 0,
        "access_flow_deleted": 0,
    }

    with models.engine.connect() as conn:
        if _table_exists(conn, "feedback_reports"):
            expired_rows = conn.execute(
                text(
                    """
                    SELECT id, attachments_json
                    FROM feedback_reports
                    WHERE created_at < :cutoff
                    """
                ),
                {"cutoff": feedback_cutoff},
            ).fetchall()

            # 첨부파일 먼저 정리 후 DB 레코드 삭제
            for row in expired_rows:
                try:
                    files = json.loads(row.attachments_json or "[]")
                except Exception:
                    files = []
                for name in files:
                    # basename 강제하여 경로 이탈 방지
                    safe_name = os.path.basename(str(name))
                    if not safe_name:
                        continue
                    if _safe_remove(UPLOAD_DIR / safe_name):
                        result["files_deleted"] += 1

            deleted = conn.execute(
                text("DELETE FROM feedback_reports WHERE created_at < :cutoff"),
                {"cutoff": feedback_cutoff},
            )
            result["feedback_deleted"] = int(deleted.rowcount or 0)

        if _table_exists(conn, "house_request_forms"):
            deleted = conn.execute(
                text("DELETE FROM house_request_forms WHERE created_at < :cutoff"),
                {"cutoff": house_cutoff},
            )
            result["house_deleted"] = int(deleted.rowcount or 0)

        if _table_exists(conn, "zibeasy_access_log"):
            deleted = conn.execute(
                text(
                    """
                    DELETE FROM zibeasy_access_log
                    WHERE is_entry = 0
                      AND wdate < :cutoff
                    """
                ),
                {"cutoff": access_flow_cutoff},
            )
            result["access_flow_deleted"] = int(deleted.rowcount or 0)

            deleted = conn.execute(
                text(
                    """
                    DELETE FROM zibeasy_access_log
                    WHERE is_entry = 1
                      AND wdate < :cutoff
                    """
                ),
                {"cutoff": access_entry_cutoff},
            )
            result["access_entry_deleted"] = int(deleted.rowcount or 0)

        conn.commit()

    return result


if __name__ == "__main__":
    output = run_cleanup()
    print(
        "privacy_cleanup completed:",
        f"house_deleted={output['house_deleted']}",
        f"feedback_deleted={output['feedback_deleted']}",
        f"files_deleted={output['files_deleted']}",
        f"access_entry_deleted={output['access_entry_deleted']}",
        f"access_flow_deleted={output['access_flow_deleted']}",
    )
