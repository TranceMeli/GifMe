import io
from unittest import mock

from django.test import override_settings
from PIL import Image

from items.models import Item
from items.services import importer

from .helpers import (
    MediaTestCase, make_gif, make_jpeg, make_mp4, make_png, make_webm, make_webp,
)


class UploadTests(MediaTestCase):
    def test_gif_upload_creates_gif_with_thumbnail(self):
        res = self.post_file(make_gif(), "funny.gif")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["type"], "gif")
        self.assertEqual((res.data["width"], res.data["height"]), (32, 32))
        item = Item.objects.get()
        self.assertTrue(item.file.name.startswith("items/"))
        self.assertTrue(item.thumbnail.name.startswith("thumbs/"))
        self.assertTrue(item.file.storage.exists(item.file.name))
        self.assertTrue(item.thumbnail.storage.exists(item.thumbnail.name))

    def test_png_and_jpeg_become_memes(self):
        self.assertEqual(self.post_file(make_png(), "a.png").data["type"], "meme")
        self.assertEqual(self.post_file(make_jpeg(), "b.jpg").data["type"], "meme")

    def test_webp_static_and_animated(self):
        self.assertEqual(self.post_file(make_webp(False), "s.webp").data["type"], "meme")
        self.assertEqual(self.post_file(make_webp(True), "a.webp").data["type"], "gif")

    def test_video_upload_uses_placeholder_without_ffmpeg(self):
        with mock.patch("items.services.thumbnails.shutil.which", return_value=None):
            res = self.post_file(make_mp4(), "clip.mp4")
            res2 = self.post_file(make_webm(), "clip.webm")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["type"], "video")
        self.assertEqual(res2.data["type"], "video")
        self.assertIsNotNone(res.data["thumbnail_url"])
        item = Item.objects.get(pk=res.data["id"])
        with item.thumbnail.open("rb") as f:
            self.assertEqual(Image.open(f).format, "JPEG")

    def test_thumbnail_is_at_most_400px(self):
        big = io.BytesIO()
        Image.new("RGB", (1200, 600), "red").save(big, "PNG")
        res = self.post_file(big.getvalue(), "big.png")
        item = Item.objects.get(pk=res.data["id"])
        with item.thumbnail.open("rb") as f:
            self.assertEqual(Image.open(f).size, (400, 200))

    def test_client_filename_is_never_used(self):
        res = self.post_file(make_png(), "../../evil name.png")
        self.assertEqual(res.status_code, 201)
        item = Item.objects.get()
        self.assertNotIn("evil", item.file.name)
        self.assertRegex(item.file.name, r"^items/[0-9a-f]{2}/[0-9a-f]{32}\.png$")

    def test_extension_comes_from_content_not_name(self):
        res = self.post_file(make_png(), "looks_like.gif")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(Item.objects.get().file.name.endswith(".png"))

    def test_fake_extension_is_rejected(self):
        res = self.post_file(b"MZ\x90\x00 not an image at all", "evil.gif")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "unsupported_type")
        self.assertEqual(Item.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), [])

    def test_truncated_image_is_rejected(self):
        res = self.post_file(make_png()[:40], "broken.png")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "invalid_file")
        self.assertEqual(self.files_on_disk(), [])

    def test_empty_file_is_rejected(self):
        res = self.post_file(b"", "empty.png")
        self.assertEqual(res.status_code, 400)

    def test_missing_source(self):
        res = self.client.post("/api/items/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "missing_source")

    @override_settings(MAX_UPLOAD_BYTES=100, MAX_UPLOAD_MB=0)
    def test_size_limit(self):
        res = self.post_file(make_png(size=(200, 200)), "big.png")
        self.assertEqual(res.status_code, 413)
        self.assertEqual(res.data["code"], "file_too_large")

    def test_type_override_and_metadata(self):
        res = self.post_file(
            make_png(), "a.png", type="gif", title="  Mein Bild ", tags="#Katze, montag ,katze"
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["type"], "gif")
        self.assertEqual(res.data["title"], "Mein Bild")
        self.assertEqual(sorted(res.data["tags"]), ["katze", "montag"])

    def test_video_type_cannot_be_forced_on_an_image(self):
        res = self.post_file(make_png(), "a.png", type="video")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "type_mismatch")

    def test_unknown_type_value(self):
        res = self.post_file(make_png(), "a.png", type="sticker")
        self.assertEqual(res.status_code, 400)


class FakeResponse(io.BytesIO):
    def __init__(self, body, content_type):
        super().__init__(body)
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


@override_settings(ALLOW_PRIVATE_URLS=True)
class UrlImportTests(MediaTestCase):
    def post_url(self, url, body=None, content_type="image/gif", **fields):
        with mock.patch.object(importer, "open_url", return_value=FakeResponse(body or b"", content_type)):
            return self.client.post("/api/items/", {"url": url, **fields}, format="json")

    def test_import_from_url(self):
        res = self.post_url("https://example.com/a.gif", make_gif(), tags=["lol"])
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["type"], "gif")
        self.assertEqual(res.data["source_url"], "https://example.com/a.gif")
        self.assertEqual(res.data["tags"], ["lol"])

    def test_rejects_other_schemes(self):
        for url in ("file:///etc/passwd", "ftp://example.com/a.gif", "javascript:alert(1)"):
            res = self.client.post("/api/items/", {"url": url}, format="json")
            self.assertEqual(res.status_code, 400, url)
            self.assertEqual(res.data["code"], "invalid_url")

    @override_settings(ALLOW_PRIVATE_URLS=False)
    def test_rejects_local_addresses(self):
        for url in ("http://127.0.0.1/a.gif", "http://localhost:8000/a.gif", "http://[::1]/a.gif"):
            res = self.client.post("/api/items/", {"url": url}, format="json")
            self.assertEqual(res.status_code, 400, url)
            self.assertEqual(res.data["code"], "invalid_url")

    def test_rejects_wrong_content_type(self):
        res = self.post_url("https://example.com/page", b"<html></html>", "text/html")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "unsupported_type")

    def test_content_type_lies_about_content(self):
        res = self.post_url("https://example.com/a.gif", b"MZ\x90\x00 exe", "image/gif")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "unsupported_type")

    @override_settings(MAX_UPLOAD_BYTES=50, MAX_UPLOAD_MB=0)
    def test_size_limit_applies_to_downloads(self):
        res = self.post_url("https://example.com/a.gif", make_gif(), "image/gif")
        self.assertEqual(res.status_code, 413)

    def test_network_error(self):
        with mock.patch.object(importer, "open_url", side_effect=OSError("timed out")):
            res = self.client.post("/api/items/", {"url": "https://example.com/a.gif"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "url_unreachable")
