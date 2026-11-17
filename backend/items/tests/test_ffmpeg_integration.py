"""Tests with the real ffmpeg and ffprobe binaries. They are skipped when the tools are not installed."""
import io
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest import skipUnless

from PIL import Image

from items.models import Item
from items.services import thumbnails

from .helpers import MediaTestCase

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
needs_ffmpeg = skipUnless(FFMPEG and FFPROBE, "ffmpeg and ffprobe are not installed")


def make_real_mp4(directory, size="160x120"):
    path = Path(directory) / f"clip-{size}.mp4"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size={size}:rate=5",
         "-t", "1", "-pix_fmt", "yuv420p", str(path)],
        check=True,
        capture_output=True,
    )
    return path


@needs_ffmpeg
class RealVideoTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_dimensions_come_from_ffprobe(self):
        path = make_real_mp4(self.tmp.name)
        self.assertEqual(thumbnails.video_dimensions(path), (160, 120))

    def test_thumbnail_is_a_real_frame_not_the_placeholder(self):
        path = make_real_mp4(self.tmp.name)
        data = thumbnails.video_thumbnail(path)
        self.assertNotEqual(data, thumbnails.placeholder_thumbnail())
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.format, "JPEG")
        self.assertEqual(image.size, (160, 120))

    def test_large_videos_get_a_thumbnail_of_at_most_400_pixels(self):
        path = make_real_mp4(self.tmp.name, "800x400")
        image = Image.open(io.BytesIO(thumbnails.video_thumbnail(path)))
        self.assertEqual(max(image.size), 400)
        self.assertEqual(image.size, (400, 200))

    def test_upload_stores_a_video_with_size_and_thumbnail(self):
        path = make_real_mp4(self.tmp.name)
        res = self.post_file(path.read_bytes(), "clip.mp4", title="Clip")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["type"], "video")
        self.assertEqual((res.data["width"], res.data["height"]), (160, 120))
        item = Item.objects.get(pk=res.data["id"])
        self.assertTrue(item.file.name.endswith(".mp4"))
        thumb = Image.open(item.thumbnail.path)
        self.assertEqual(thumb.size, (160, 120))

    def test_the_same_video_is_a_duplicate(self):
        path = make_real_mp4(self.tmp.name)
        self.assertEqual(self.post_file(path.read_bytes(), "a.mp4").status_code, 201)
        res = self.post_file(path.read_bytes(), "b.mp4")
        self.assertEqual((res.status_code, res.data["code"]), (409, "duplicate"))

    def test_a_video_cannot_be_edited(self):
        path = make_real_mp4(self.tmp.name)
        item = self.post_file(path.read_bytes(), "a.mp4").data
        res = self.client.get(f"/api/items/{item['id']}/edit-info/")
        self.assertEqual((res.status_code, res.data["code"]), (400, "not_editable"))
