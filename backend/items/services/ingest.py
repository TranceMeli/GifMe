"""Turns an incoming byte stream (upload or download) into a stored Item."""
import hashlib
import logging
import os
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction

from ..errors import ApiError, DuplicateItemError
from ..models import Item
from . import detection, thumbnails
from .tags import set_item_tags

logger = logging.getLogger(__name__)

CHUNK = 64 * 1024


def too_large():
    return ApiError(
        f"The file is larger than the limit of {settings.MAX_UPLOAD_MB} MB.",
        code="file_too_large",
        status_code=413,
    )


def spool_to_disk(stream):
    """Copy the stream to a temp file; returns (path, sha256 hex, size). Enforces the size limit."""
    sha = hashlib.sha256()
    size = 0
    fd, name = tempfile.mkstemp(prefix="gifme_")
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := stream.read(CHUNK):
                size += len(chunk)
                if size > settings.MAX_UPLOAD_BYTES:
                    raise too_large()
                sha.update(chunk)
                out.write(chunk)
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise
    return Path(name), sha.hexdigest(), size


def _serialize_existing(item):
    from ..serializers import ItemSerializer  # local import avoids a cycle

    return ItemSerializer(item).data


def create_item(stream, *, requested_type="", title="", tags=(), source_url=""):
    """Validate, deduplicate, thumbnail and persist. Raises ApiError subclasses on bad input."""
    path, digest, size = spool_to_disk(stream)
    try:
        if size == 0:
            raise ApiError("The file is empty.", code="invalid_file")

        with path.open("rb") as f:
            fmt = detection.sniff_format(f.read(detection.HEAD_SIZE))
        if fmt is None:
            raise ApiError(
                "This file type is not supported. Allowed are GIF, PNG, JPG, WebP, MP4 and WebM.",
                code="unsupported_type",
            )

        existing = Item.objects.filter(sha256=digest).first()
        if existing:
            raise DuplicateItemError(existing.id, _serialize_existing(existing))

        if fmt.is_video:
            animated = False
            width, height = thumbnails.video_dimensions(path)
            thumb_bytes = thumbnails.video_thumbnail(path)
        else:
            info = detection.inspect_image(path)
            animated = info.animated
            width, height = info.width, info.height
            thumb_bytes = thumbnails.image_thumbnail(path)
        item_type = detection.resolve_type(requested_type, fmt, animated)

        item = Item(
            type=item_type,
            title=title,
            sha256=digest,
            width=width,
            height=height,
            size_bytes=size,
            source_url=source_url,
        )
        item.stored_extension = fmt.extension
        try:
            with transaction.atomic():
                with path.open("rb") as f:
                    item.file.save("upload", File(f), save=False)
                item.thumbnail.save("thumb.jpg", ContentFile(thumb_bytes), save=False)
                item.save()
                set_item_tags(item, tags)
        except IntegrityError:
            # A concurrent request stored the same file between the check and the insert.
            _discard_files(item)
            existing = Item.objects.get(sha256=digest)
            raise DuplicateItemError(existing.id, _serialize_existing(existing)) from None
        except BaseException:
            _discard_files(item)
            raise
        return item
    finally:
        path.unlink(missing_ok=True)


def _discard_files(item):
    for f in (item.file, item.thumbnail):
        if f and f.name:
            f.storage.delete(f.name)


def replace_content(item, stream):
    """Swap the stored file of an existing item for edited bytes; old files are removed."""
    path, digest, size = spool_to_disk(stream)
    try:
        if digest == item.sha256:
            return item
        clash = Item.objects.filter(sha256=digest).exclude(pk=item.pk).first()
        if clash:
            raise DuplicateItemError(clash.id, _serialize_existing(clash))

        with path.open("rb") as f:
            fmt = detection.sniff_format(f.read(detection.HEAD_SIZE))
        info = detection.inspect_image(path)
        thumb_bytes = thumbnails.image_thumbnail(path)

        old_names = [(item.file.storage, item.file.name), (item.thumbnail.storage, item.thumbnail.name)]
        item.stored_extension = fmt.extension
        with path.open("rb") as f:
            item.file.save("upload", File(f), save=False)
        item.thumbnail.save("thumb.jpg", ContentFile(thumb_bytes), save=False)
        item.sha256, item.size_bytes = digest, size
        item.width, item.height = info.width, info.height
        item.save()
        for storage, name in old_names:
            if name:
                storage.delete(name)
        return item
    finally:
        path.unlink(missing_ok=True)
