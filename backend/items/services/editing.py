"""Server-side editing of GIFs and still images: trim, reverse, speed, crop, rotate, scale."""
import io
from dataclasses import dataclass

from PIL import Image, ImageSequence

from ..errors import ApiError
from ..models import Item
from . import detection

MIN_FRAME_MS = 20  # browsers clamp shorter GIF delays anyway
DEFAULT_FRAME_MS = 100
MAX_CROP_PERCENT = 45
ROTATIONS = (0, 90, 180, 270)


@dataclass
class EditParams:
    start: int | None = None  # first frame to keep, 0-based
    end: int | None = None  # last frame to keep, inclusive
    reverse: bool = False
    speed: float = 1.0
    crop_left: float = 0
    crop_right: float = 0
    crop_top: float = 0
    crop_bottom: float = 0
    rotate: int = 0
    scale: int = 100  # percent

    @classmethod
    def from_data(cls, data):
        def number(key, default, low, high, cast=float):
            value = data.get(key, default)
            try:
                value = cast(value)
            except (TypeError, ValueError):
                raise ApiError(f"Invalid value for {key}.", code="invalid_edit") from None
            if not low <= value <= high:
                raise ApiError(f"Value for {key} is outside the allowed range.", code="invalid_edit")
            return value

        crop = data.get("crop") or {}
        params = cls(
            reverse=bool(data.get("reverse", False)),
            speed=number("speed", 1.0, 0.25, 4.0),
            rotate=number("rotate", 0, 0, 270, int),
            scale=number("scale", 100, 10, 100, int),
        )
        for side in ("left", "right", "top", "bottom"):
            value = crop.get(side, 0)
            try:
                value = float(value)
            except (TypeError, ValueError):
                raise ApiError("Invalid crop.", code="invalid_edit") from None
            if not 0 <= value <= MAX_CROP_PERCENT:
                raise ApiError(f"Crop at most {MAX_CROP_PERCENT} % per side.", code="invalid_edit")
            setattr(params, f"crop_{side}", value)
        if params.rotate not in ROTATIONS:
            raise ApiError("Rotation must be a multiple of 90 degrees.", code="invalid_edit")
        for key in ("start", "end"):
            if data.get(key) is not None:
                setattr(params, key, number(key, 0, 0, 100000, int))
        if params.start is not None and params.end is not None and params.start > params.end:
            raise ApiError("The start frame is after the end frame.", code="invalid_edit")
        return params


def _frames(img):
    """All frames as RGBA copies with their durations in ms."""
    frames, durations = [], []
    for frame in ImageSequence.Iterator(img):
        durations.append(int(frame.info.get("duration") or DEFAULT_FRAME_MS))
        frames.append(frame.convert("RGBA"))
    return frames, durations


def _transform(frame, p):
    w, h = frame.size
    left, top = round(w * p.crop_left / 100), round(h * p.crop_top / 100)
    right, bottom = w - round(w * p.crop_right / 100), h - round(h * p.crop_bottom / 100)
    if right - left < 1 or bottom - top < 1:
        raise ApiError("The crop leaves no image.", code="invalid_edit")
    frame = frame.crop((left, top, right, bottom))
    if p.rotate:
        frame = frame.rotate(-p.rotate, expand=True)  # PIL rotates counter-clockwise
    if p.scale != 100:
        size = (max(1, round(frame.width * p.scale / 100)), max(1, round(frame.height * p.scale / 100)))
        frame = frame.resize(size, Image.Resampling.LANCZOS)
    return frame


def frame_info(item):
    """Facts the edit page needs: frame count, total duration and size."""
    with item.file.open("rb") as f, Image.open(f) as img:
        frames = getattr(img, "n_frames", 1)
        total = 0
        for i in range(frames):
            img.seek(i)
            total += int(img.info.get("duration") or DEFAULT_FRAME_MS)
        return {"frame_count": frames, "duration_ms": total if frames > 1 else 0,
                "width": img.width, "height": img.height}


def render(item, params):
    """Apply the edit and return (bytes, mime type)."""
    if item.type == Item.Type.VIDEO:
        raise ApiError("Videos cannot be edited yet.", code="not_editable")

    with item.file.open("rb") as f, Image.open(f) as img:
        source_format = img.format
        frames, durations = _frames(img)

    animated = len(frames) > 1
    if animated:
        last = len(frames) - 1
        start = min(params.start or 0, last)
        end = min(params.end if params.end is not None else last, last)
        frames, durations = frames[start : end + 1], durations[start : end + 1]
        if params.reverse:
            frames.reverse()
            durations.reverse()
        durations = [max(MIN_FRAME_MS, round(d / params.speed)) for d in durations]
    elif params.reverse or params.speed != 1.0:
        # Nothing to reverse or speed up in a still image; ignore quietly.
        pass

    frames = [_transform(f, params) for f in frames]
    out = io.BytesIO()

    if source_format == "GIF":
        frames[0].save(
            out, "GIF", save_all=True, append_images=frames[1:], duration=durations,
            loop=0, disposal=2, optimize=False,
        )
        return out.getvalue(), detection.GIF.mime
    if source_format == "WEBP":
        frames[0].save(
            out, "WEBP", save_all=True, append_images=frames[1:], duration=durations,
            loop=0, quality=90,
        )
        return out.getvalue(), detection.WEBP.mime
    if source_format == "JPEG":
        frames[0].convert("RGB").save(out, "JPEG", quality=92)
        return out.getvalue(), detection.JPEG.mime
    frames[0].save(out, "PNG")
    return out.getvalue(), detection.PNG.mime
