"""
매물 이미지 저장/삭제 공통 헬퍼
"""
from io import BytesIO
import logging
from pathlib import Path

from PIL import Image, ImageOps
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parents[2] / 'data' / 'maemul'
BIG_DIR = BASE_DIR / 'big'
THUMB_DIR = BASE_DIR / 'thumb'

BIG_SIZE = (770, 513)
THUMB_SIZE = (320, 213)
JPEG_QUALITY_BIG = 88
JPEG_QUALITY_THUMB = 82
SUPPORTED_SIZES = {'big', 'thumb'}
FORMAT_BY_EXT = {
    '.jpg': 'JPEG',
    '.jpeg': 'JPEG',
    '.png': 'PNG',
    '.webp': 'WEBP',
}


def ensure_maemul_image_dirs():
    BIG_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)


def get_maemul_image_path(size: str, filename: str) -> Path:
    if size not in SUPPORTED_SIZES:
        raise ValueError(f'Unsupported image size: {size}')
    safe_filename = secure_filename(filename)
    if not safe_filename:
        raise ValueError('Invalid image filename')
    ensure_maemul_image_dirs()
    target_dir = BIG_DIR if size == 'big' else THUMB_DIR
    return target_dir / safe_filename


def _get_save_kwargs(image_format: str, quality: int) -> dict:
    if image_format == 'JPEG':
        return {'format': image_format, 'quality': quality}
    if image_format == 'WEBP':
        return {'format': image_format, 'quality': quality}
    if image_format == 'PNG':
        return {'format': image_format, 'optimize': True}
    return {'format': image_format}


def _fit_to_canvas(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert('RGB')
    fitted = image.copy()
    fitted.thumbnail(size, Image.LANCZOS)

    canvas = Image.new('RGB', size, (255, 255, 255))
    offset_x = (size[0] - fitted.width) // 2
    offset_y = (size[1] - fitted.height) // 2
    canvas.paste(fitted, (offset_x, offset_y))
    return canvas


def create_thumb_from_bytes(filename: str, image_bytes: bytes) -> str | None:
    safe_filename = secure_filename(filename)
    if not safe_filename:
        return None

    ext = Path(safe_filename).suffix.lower()
    image_format = FORMAT_BY_EXT.get(ext, 'JPEG')
    save_kwargs = _get_save_kwargs(image_format, JPEG_QUALITY_THUMB)

    with Image.open(BytesIO(image_bytes)) as image:
        thumb_image = _fit_to_canvas(image, THUMB_SIZE)
        thumb_path = get_maemul_image_path('thumb', safe_filename)
        thumb_image.save(thumb_path, **save_kwargs)

    return safe_filename


def save_synced_image_variants(filename: str, image_bytes: bytes) -> str | None:
    safe_filename = secure_filename(filename)
    if not safe_filename:
        return None

    big_path = get_maemul_image_path('big', safe_filename)
    big_path.write_bytes(image_bytes)
    create_thumb_from_bytes(safe_filename, image_bytes)
    thumb_path = get_maemul_image_path('thumb', safe_filename)
    logging.info(
        "🖼️ 동기화 이미지 변환 완료: file=%s, big=%s, thumb=%s",
        safe_filename,
        big_path,
        thumb_path,
    )
    return safe_filename


def save_admin_image_variants(file_storage: FileStorage, filename: str) -> str | None:
    safe_filename = secure_filename(filename)
    if not safe_filename:
        return None

    raw_bytes = file_storage.read()
    if not raw_bytes:
        return None

    with Image.open(BytesIO(raw_bytes)) as image:
        big_image = _fit_to_canvas(image, BIG_SIZE)
        big_path = get_maemul_image_path('big', safe_filename)
        big_image.save(big_path, format='JPEG', quality=JPEG_QUALITY_BIG)

    create_thumb_from_bytes(safe_filename, raw_bytes)
    return safe_filename


def delete_maemul_image_variants(filename: str):
    for size in SUPPORTED_SIZES:
        try:
            image_path = get_maemul_image_path(size, filename)
        except ValueError:
            continue
        if image_path.exists():
            image_path.unlink()
