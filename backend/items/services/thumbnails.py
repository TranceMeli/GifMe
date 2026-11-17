"""Thumbnail generation: Pillow for images, ffmpeg for videos, a drawn placeholder as fallback."""
import io
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings
from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)

BACKGROUND = (255, 246, 223)  # container cream, used behind transparent images
PLACEHOLDER_BLUE = (115, 165, 202)
INK = (46, 36, 24)

_warned_missing = set()


def _to_jpeg(img: Image.Image) -> bytes:
    img.thumbnail((settings.THUMBNAIL_SIZE, settings.THUMBNAIL_SIZE), Image.Resampling.LANCZOS)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        flat = Image.new("RGB", img.size, BACKGROUND)
        flat.paste(img, mask=img.split()[-1])
        img = flat
    else:
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85, optimize=True)
    return out.getvalue()


def image_thumbnail(path) -> bytes:
    """First frame, longest side scaled down to THUMBNAIL_SIZE."""
    with Image.open(path) as img:
        img.seek(0)
        return _to_jpeg(img.copy())


def placeholder_thumbnail() -> bytes:
    size = settings.THUMBNAIL_SIZE
    img = Image.new("RGB", (size, size), PLACEHOLDER_BLUE)
    draw = ImageDraw.Draw(img)
    c, r = size // 2, size // 5
    draw.ellipse((c - r, c - r, c + r, c + r), outline=INK, width=8)
    draw.polygon([(c - r // 3, c - r // 2), (c - r // 3, c + r // 2), (c + r // 2, c)], fill=INK)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()


def _tool(name):
    """Resolve an external binary, warning once if it is not installed."""
    binary = shutil.which(name)
    if binary is None and name not in _warned_missing:
        _warned_missing.add(name)
        logger.warning(
            "%s was not found. Video thumbnails fall back to a placeholder and video "
            "dimensions are unknown. Install ffmpeg to enable them.",
            name,
        )
    return binary


def video_thumbnail(path) -> bytes:
    """One frame via ffmpeg; a placeholder if ffmpeg is missing or fails."""
    ffmpeg = _tool(settings.FFMPEG_BIN)
    if ffmpeg is None:
        return placeholder_thumbnail()
    size = settings.THUMBNAIL_SIZE
    scale = f"scale='if(gt(iw,ih),min({size},iw),-2)':'if(gt(iw,ih),-2,min({size},ih))'"
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "frame.jpg"
        cmd = [ffmpeg, "-v", "error", "-y", "-i", str(path), "-frames:v", "1", "-vf", scale, str(out)]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=60)
            return out.read_bytes()
        except (subprocess.SubprocessError, OSError) as exc:
            logger.warning("ffmpeg could not extract a frame (%s). Using a placeholder.", exc)
            return placeholder_thumbnail()


def video_dimensions(path):
    """(width, height) via ffprobe, or (None, None) if unavailable."""
    ffprobe = _tool(settings.FFPROBE_BIN)
    if ffprobe is None:
        return None, None
    cmd = [
        ffprobe, "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(path),
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, timeout=30, text=True)
        stream = json.loads(result.stdout)["streams"][0]
        return int(stream["width"]), int(stream["height"])
    except (subprocess.SubprocessError, OSError, KeyError, IndexError, ValueError):
        return None, None
