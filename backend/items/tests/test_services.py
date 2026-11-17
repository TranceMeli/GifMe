"""Unit tests for the service modules, without going through the HTTP API."""
import io
import json
import socket
import subprocess
import tempfile
import urllib.request
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, override_settings
from PIL import Image

from items.errors import ApiError
from items.models import Item
from items.services import detection, editing, importer, tags, thumbnails

from .helpers import make_gif, make_png, make_webp


def addrinfo(*ips):
    """Shape of socket.getaddrinfo results for the given addresses."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 80)) for ip in ips]


class NormalizeTagsTests(SimpleTestCase):
    def test_none_and_empty_values(self):
        self.assertEqual(tags.normalize_tags(None), [])
        self.assertEqual(tags.normalize_tags([]), [])
        self.assertEqual(tags.normalize_tags(["", "  ", "#"]), [])

    def test_comma_separated_string(self):
        self.assertEqual(tags.normalize_tags("cat, Dog ,#Bird"), ["cat", "dog", "bird"])

    def test_list_entries_may_hold_commas(self):
        self.assertEqual(tags.normalize_tags(["a,b", "c"]), ["a", "b", "c"])

    def test_lowercase_hash_and_whitespace(self):
        self.assertEqual(tags.normalize_tags(["  #Good   Morning "]), ["good morning"])

    def test_duplicates_are_removed_keeping_order(self):
        self.assertEqual(tags.normalize_tags(["b", "A", "a", "#B"]), ["b", "a"])

    def test_rejects_non_list_input(self):
        with self.assertRaises(ApiError) as ctx:
            tags.normalize_tags({"a": 1})
        self.assertEqual(ctx.exception.detail.code, "invalid_tags")

    def test_rejects_non_text_entries(self):
        with self.assertRaises(ApiError) as ctx:
            tags.normalize_tags(["ok", 5])
        self.assertEqual(ctx.exception.detail.code, "invalid_tags")

    def test_rejects_too_long_tag(self):
        tags.normalize_tags(["x" * tags.MAX_TAG_LENGTH])
        with self.assertRaises(ApiError):
            tags.normalize_tags(["x" * (tags.MAX_TAG_LENGTH + 1)])

    def test_rejects_too_many_tags(self):
        tags.normalize_tags([f"t{i}" for i in range(tags.MAX_TAGS)])
        with self.assertRaises(ApiError):
            tags.normalize_tags([f"t{i}" for i in range(tags.MAX_TAGS + 1)])


class DetectionTests(SimpleTestCase):
    def test_sniff_format_from_content(self):
        self.assertIs(detection.sniff_format(make_gif()[:64]), detection.GIF)
        self.assertIs(detection.sniff_format(make_png()[:64]), detection.PNG)
        self.assertIs(detection.sniff_format(make_webp(False)[:64]), detection.WEBP)
        self.assertIsNone(detection.sniff_format(b"just some text"))
        self.assertIsNone(detection.sniff_format(b""))

    def test_suggest_type_matrix(self):
        self.assertEqual(detection.suggest_type(detection.GIF, True), Item.Type.GIF)
        self.assertEqual(detection.suggest_type(detection.GIF, False), Item.Type.GIF)
        self.assertEqual(detection.suggest_type(detection.WEBP, True), Item.Type.GIF)
        self.assertEqual(detection.suggest_type(detection.WEBP, False), Item.Type.MEME)
        self.assertEqual(detection.suggest_type(detection.PNG, False), Item.Type.MEME)
        self.assertEqual(detection.suggest_type(detection.MP4, False), Item.Type.VIDEO)
        self.assertEqual(detection.suggest_type(detection.WEBM, False), Item.Type.VIDEO)

    def test_resolve_type_honors_a_compatible_override(self):
        self.assertEqual(detection.resolve_type("meme", detection.GIF, True), "meme")
        self.assertEqual(detection.resolve_type("gif", detection.PNG, False), "gif")
        self.assertEqual(detection.resolve_type("", detection.PNG, False), "meme")

    def test_resolve_type_rejects_mismatches_and_unknown_values(self):
        with self.assertRaises(ApiError) as ctx:
            detection.resolve_type("video", detection.PNG, False)
        self.assertEqual(ctx.exception.detail.code, "type_mismatch")
        with self.assertRaises(ApiError) as ctx:
            detection.resolve_type("gif", detection.MP4, False)
        self.assertEqual(ctx.exception.detail.code, "type_mismatch")
        with self.assertRaises(ApiError) as ctx:
            detection.resolve_type("sticker", detection.GIF, True)
        self.assertEqual(ctx.exception.detail.code, "invalid_type")

    def test_inspect_image_reads_size_and_animation(self):
        with tempfile.TemporaryDirectory() as tmp:
            gif, png = Path(tmp, "a.gif"), Path(tmp, "b.png")
            gif.write_bytes(make_gif(3))
            png.write_bytes(make_png(size=(30, 20)))
            info = detection.inspect_image(gif)
            self.assertEqual((info.width, info.height, info.animated), (32, 32, True))
            info = detection.inspect_image(png)
            self.assertEqual((info.width, info.height, info.animated), (30, 20, False))

    def test_inspect_image_rejects_corrupt_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp, "bad.png")
            bad.write_bytes(make_png()[:40])
            with self.assertRaises(ApiError) as ctx:
                detection.inspect_image(bad)
            self.assertEqual(ctx.exception.detail.code, "invalid_file")


class EditParamsTests(SimpleTestCase):
    def test_defaults(self):
        p = editing.EditParams.from_data({})
        self.assertEqual((p.start, p.end, p.reverse, p.speed, p.rotate, p.scale), (None, None, False, 1.0, 0, 100))
        self.assertEqual((p.crop_left, p.crop_right, p.crop_top, p.crop_bottom), (0, 0, 0, 0))

    def test_full_payload(self):
        p = editing.EditParams.from_data(
            {"start": 2, "end": 9, "reverse": True, "speed": 2, "rotate": 90, "scale": 50,
             "crop": {"left": 10, "right": 5, "top": 0, "bottom": 45}}
        )
        self.assertEqual((p.start, p.end, p.reverse, p.speed, p.rotate, p.scale), (2, 9, True, 2.0, 90, 50))
        self.assertEqual((p.crop_left, p.crop_right, p.crop_top, p.crop_bottom), (10, 5, 0, 45))

    def test_boundaries_are_accepted(self):
        for data in ({"speed": 0.25}, {"speed": 4}, {"scale": 10}, {"rotate": 270}, {"crop": {"left": 45}}):
            editing.EditParams.from_data(data)

    def test_invalid_values_raise_invalid_edit(self):
        bad = [
            {"speed": 0.1}, {"speed": 5}, {"speed": "fast"}, {"scale": 5}, {"scale": 101},
            {"rotate": 45}, {"rotate": 360}, {"rotate": -90}, {"crop": {"left": 46}},
            {"crop": {"top": -1}}, {"crop": {"right": "wide"}}, {"start": -1}, {"start": 5, "end": 2},
        ]
        for data in bad:
            with self.assertRaises(ApiError, msg=str(data)) as ctx:
                editing.EditParams.from_data(data)
            self.assertEqual(ctx.exception.detail.code, "invalid_edit", str(data))

    def test_messages_are_english(self):
        with self.assertRaises(ApiError) as ctx:
            editing.EditParams.from_data({"rotate": 45})
        self.assertIn("90", str(ctx.exception.detail))
        self.assertTrue(str(ctx.exception.detail).isascii())


@override_settings(ALLOW_PRIVATE_URLS=False)
class ValidateUrlTests(SimpleTestCase):
    def check(self, url, *ips):
        with mock.patch("items.services.importer.socket.getaddrinfo", return_value=addrinfo(*ips)):
            importer.validate_url(url)

    def test_public_http_and_https_are_allowed(self):
        self.check("http://example.com/a.gif", "93.184.216.34")
        self.check("https://example.com/a.gif", "93.184.216.34")

    def test_other_schemes_and_missing_hosts_are_rejected(self):
        for url in ("ftp://example.com/a.gif", "file:///etc/passwd", "javascript:alert(1)", "https:///a.gif", "example.com"):
            with self.assertRaises(ApiError, msg=url) as ctx:
                importer.validate_url(url)
            self.assertEqual(ctx.exception.detail.code, "invalid_url", url)

    def test_private_and_local_addresses_are_rejected(self):
        for ip in ("127.0.0.1", "10.0.0.5", "192.168.1.20", "172.16.0.9", "169.254.169.254", "0.0.0.0"):
            with self.assertRaises(ApiError, msg=ip) as ctx:
                self.check("http://internal.example/a.gif", ip)
            self.assertEqual(ctx.exception.detail.code, "invalid_url", ip)

    def test_one_private_answer_among_public_ones_is_enough_to_reject(self):
        with self.assertRaises(ApiError):
            self.check("http://mixed.example/a.gif", "93.184.216.34", "10.0.0.1")

    def test_unresolvable_host(self):
        with mock.patch("items.services.importer.socket.getaddrinfo", side_effect=socket.gaierror):
            with self.assertRaises(ApiError) as ctx:
                importer.validate_url("http://nope.invalid/a.gif")
        self.assertEqual(ctx.exception.detail.code, "url_unreachable")

    @override_settings(ALLOW_PRIVATE_URLS=True)
    def test_override_allows_private_addresses(self):
        importer.validate_url("http://127.0.0.1:8000/a.gif")

    def test_redirects_are_checked_again(self):
        handler = importer._CheckedRedirects()
        request = urllib.request.Request("http://example.com/start")
        with mock.patch("items.services.importer.socket.getaddrinfo", return_value=addrinfo("10.0.0.1")):
            with self.assertRaises(ApiError):
                handler.redirect_request(request, None, 302, "Found", {}, "http://internal.example/secret")


class ThumbnailTests(SimpleTestCase):
    def write(self, tmp, name, content):
        path = Path(tmp, name)
        path.write_bytes(content)
        return path

    def test_large_images_are_scaled_to_the_limit_as_jpeg(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(tmp, "big.png", make_png(size=(1200, 600)))
            data = thumbnails.image_thumbnail(path)
        img = Image.open(io.BytesIO(data))
        self.assertEqual(img.format, "JPEG")
        self.assertEqual(max(img.size), 400)
        self.assertEqual(img.size, (400, 200))

    def test_small_images_are_not_enlarged(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(tmp, "small.png", make_png(size=(50, 40)))
            img = Image.open(io.BytesIO(thumbnails.image_thumbnail(path)))
        self.assertEqual(img.size, (50, 40))

    def test_transparency_is_flattened_onto_the_container_color(self):
        out = io.BytesIO()
        Image.new("RGBA", (40, 40), (0, 0, 0, 0)).save(out, "PNG")
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(tmp, "clear.png", out.getvalue())
            img = Image.open(io.BytesIO(thumbnails.image_thumbnail(path))).convert("RGB")
        r, g, b = img.getpixel((20, 20))
        for got, want in zip((r, g, b), thumbnails.BACKGROUND):
            self.assertAlmostEqual(got, want, delta=6)

    def test_animated_gif_uses_the_first_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(tmp, "a.gif", make_gif(4))
            img = Image.open(io.BytesIO(thumbnails.image_thumbnail(path)))
        self.assertEqual(img.format, "JPEG")
        self.assertFalse(getattr(img, "is_animated", False))

    def test_placeholder_is_a_square_jpeg(self):
        img = Image.open(io.BytesIO(thumbnails.placeholder_thumbnail()))
        self.assertEqual(img.format, "JPEG")
        self.assertEqual(img.size, (400, 400))

    def test_video_thumbnail_falls_back_without_ffmpeg(self):
        with mock.patch("items.services.thumbnails.shutil.which", return_value=None):
            data = thumbnails.video_thumbnail("whatever.mp4")
        self.assertEqual(data, thumbnails.placeholder_thumbnail())

    def test_video_thumbnail_falls_back_when_ffmpeg_fails(self):
        error = subprocess.CalledProcessError(1, "ffmpeg")
        with mock.patch("items.services.thumbnails.shutil.which", return_value="ffmpeg"), \
                mock.patch("items.services.thumbnails.subprocess.run", side_effect=error):
            data = thumbnails.video_thumbnail("whatever.mp4")
        self.assertEqual(data, thumbnails.placeholder_thumbnail())

    def test_video_dimensions_unknown_without_ffprobe(self):
        with mock.patch("items.services.thumbnails.shutil.which", return_value=None):
            self.assertEqual(thumbnails.video_dimensions("x.mp4"), (None, None))

    def test_video_dimensions_are_read_from_ffprobe_output(self):
        result = mock.Mock(stdout=json.dumps({"streams": [{"width": 640, "height": 360}]}))
        with mock.patch("items.services.thumbnails.shutil.which", return_value="ffprobe"), \
                mock.patch("items.services.thumbnails.subprocess.run", return_value=result):
            self.assertEqual(thumbnails.video_dimensions("x.mp4"), (640, 360))

    def test_video_dimensions_survive_garbage_output(self):
        result = mock.Mock(stdout="not json")
        with mock.patch("items.services.thumbnails.shutil.which", return_value="ffprobe"), \
                mock.patch("items.services.thumbnails.subprocess.run", return_value=result):
            self.assertEqual(thumbnails.video_dimensions("x.mp4"), (None, None))
