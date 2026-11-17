"""Content-based file type detection (magic bytes). File names and client MIME types are ignored."""
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

from ..errors import ApiError
from ..models import Item


@dataclass(frozen=True)
class Format:
    name: str
    extension: str
    mime: str
    is_video: bool = False


GIF = Format("gif", ".gif", "image/gif")
PNG = Format("png", ".png", "image/png")
JPEG = Format("jpeg", ".jpg", "image/jpeg")
WEBP = Format("webp", ".webp", "image/webp")
MP4 = Format("mp4", ".mp4", "video/mp4", is_video=True)
WEBM = Format("webm", ".webm", "video/webm", is_video=True)

# Content types accepted by the URL import (parameters like charset are stripped first).
ALLOWED_MIME_TYPES = {f.mime for f in (GIF, PNG, JPEG, WEBP, MP4, WEBM)}

HEAD_SIZE = 4096


def sniff_format(head: bytes):
    """Return the Format matching the leading bytes, or None if unsupported."""
    if head.startswith((b"GIF87a", b"GIF89a")):
        return GIF
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if head.startswith(b"\xff\xd8\xff"):
        return JPEG
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return WEBP
    if head[4:8] == b"ftyp":
        return MP4
    if head.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in head[:HEAD_SIZE]:
        return WEBM
    return None


@dataclass(frozen=True)
class ImageInfo:
    width: int
    height: int
    animated: bool


def inspect_image(path) -> ImageInfo:
    """Open the image fully enough to reject corrupt files and read its size."""
    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            return ImageInfo(img.width, img.height, bool(getattr(img, "is_animated", False)))
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ApiError(
            "The image file is corrupt or cannot be read.", code="invalid_file"
        ) from exc


def suggest_type(fmt: Format, animated: bool) -> str:
    """Auto type: gif and animated webp are gifs, still images memes, mp4 and webm videos."""
    if fmt.is_video:
        return Item.Type.VIDEO
    if fmt is GIF or (fmt is WEBP and animated):
        return Item.Type.GIF
    return Item.Type.MEME


def resolve_type(requested: str, fmt: Format, animated: bool) -> str:
    """Honor a client override, but never label a video as an image or the reverse."""
    suggested = suggest_type(fmt, animated)
    if not requested:
        return suggested
    if requested not in Item.Type.values:
        raise ApiError("Unknown type. Allowed types are gif, meme and video.", code="invalid_type")
    if (requested == Item.Type.VIDEO) != fmt.is_video:
        raise ApiError(
            "The selected type does not match the file content.", code="type_mismatch"
        )
    return requested
