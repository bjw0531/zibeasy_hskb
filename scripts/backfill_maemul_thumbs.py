#!/usr/bin/env python3
"""기존 big 매물 이미지로 thumb 이미지를 일괄 생성한다."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.utils.maemul_images import BIG_DIR, THUMB_DIR, create_thumb_from_bytes, ensure_maemul_image_dirs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="기존 big 이미지 -> thumb 백필 생성")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="이미 thumb가 있어도 다시 생성합니다.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="처리할 최대 파일 수. 0이면 전체 처리.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=500,
        help="진행 상황을 출력할 간격.",
    )
    return parser.parse_args()


def iter_big_images(limit: int):
    count = 0
    for image_path in sorted(BIG_DIR.iterdir()):
        if not image_path.is_file():
            continue
        yield image_path
        count += 1
        if limit and count >= limit:
            return


def main() -> int:
    args = parse_args()
    ensure_maemul_image_dirs()

    if not BIG_DIR.exists():
        print(f"big 폴더가 없습니다: {BIG_DIR}")
        return 1

    total_big = sum(1 for path in BIG_DIR.iterdir() if path.is_file())
    target_total = min(total_big, args.limit) if args.limit else total_big
    print(
        f"backfill start: big={total_big}, target={target_total}, "
        f"overwrite={'yes' if args.overwrite else 'no'}"
    )

    created = 0
    skipped = 0
    failed = 0
    processed = 0

    for image_path in iter_big_images(args.limit):
        processed += 1
        thumb_path = THUMB_DIR / image_path.name

        if thumb_path.exists() and not args.overwrite:
            skipped += 1
        else:
            try:
                saved_name = create_thumb_from_bytes(image_path.name, image_path.read_bytes())
                if saved_name:
                    created += 1
                else:
                    failed += 1
                    print(f"failed: invalid filename={image_path.name}")
            except Exception as exc:
                failed += 1
                print(f"failed: file={image_path.name} error={exc}")

        if processed % args.progress_every == 0 or processed == target_total:
            print(
                f"progress: processed={processed}/{target_total} "
                f"created={created} skipped={skipped} failed={failed}"
            )

    print(
        f"backfill done: processed={processed}, created={created}, "
        f"skipped={skipped}, failed={failed}, thumb_dir={THUMB_DIR}"
    )
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
