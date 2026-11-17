import io
import shutil
import tempfile
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase


def make_png(color=(200, 30, 30), size=(64, 48)):
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "PNG")
    return out.getvalue()


def make_jpeg(color=(30, 200, 30), size=(64, 48)):
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "JPEG")
    return out.getvalue()


def _frames(n):
    return [Image.new("RGB", (32, 32), (i * 40 % 256, 10, 200)) for i in range(n)]


def make_gif(frames=3):
    out = io.BytesIO()
    imgs = _frames(frames)
    imgs[0].save(out, "GIF", save_all=True, append_images=imgs[1:], duration=80, loop=0)
    return out.getvalue()


def make_webp(animated):
    out = io.BytesIO()
    imgs = _frames(3 if animated else 1)
    if animated:
        imgs[0].save(out, "WEBP", save_all=True, append_images=imgs[1:], duration=80, lossless=True)
    else:
        imgs[0].save(out, "WEBP")
    return out.getvalue()


def make_mp4(tag=b"a"):
    """Bytes with a valid MP4 'ftyp' signature. Enough for sniffing; not decodable."""
    return b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + tag * 64


def make_webm(tag=b"a"):
    return b"\x1a\x45\xdf\xa3\x93\x42\x82\x88webm" + tag * 64


def upload(content, name="file.bin", content_type="application/octet-stream"):
    return SimpleUploadedFile(name, content, content_type=content_type)


class MediaTestCase(APITestCase):
    """Each test gets an empty MEDIA_ROOT and, by default, no ffmpeg."""

    def setUp(self):
        super().setUp()
        self.media_root = Path(tempfile.mkdtemp(prefix="gifme_test_"))
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

    def post_file(self, content, name="file.bin", **fields):
        return self.client.post(
            "/api/items/", {"file": upload(content, name), **fields}, format="multipart"
        )

    def files_on_disk(self):
        return sorted(p for p in self.media_root.rglob("*") if p.is_file())
