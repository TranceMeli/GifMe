from django.test import SimpleTestCase

from items.services import detection

from .helpers import make_gif, make_jpeg, make_mp4, make_png, make_webm, make_webp


class SniffFormatTests(SimpleTestCase):
    def test_known_formats(self):
        cases = {
            make_gif(): detection.GIF,
            make_png(): detection.PNG,
            make_jpeg(): detection.JPEG,
            make_webp(False): detection.WEBP,
            make_mp4(): detection.MP4,
            make_webm(): detection.WEBM,
        }
        for content, expected in cases.items():
            self.assertIs(detection.sniff_format(content[:4096]), expected)

    def test_unknown_content(self):
        self.assertIsNone(detection.sniff_format(b"MZ\x90\x00 this is an exe"))
        self.assertIsNone(detection.sniff_format(b"<svg></svg>"))
        self.assertIsNone(detection.sniff_format(b""))

    def test_matroska_without_webm_doctype_is_rejected(self):
        self.assertIsNone(detection.sniff_format(b"\x1a\x45\xdf\xa3\x93\x42\x82\x88matroska" + b"x" * 40))


class SuggestTypeTests(SimpleTestCase):
    def test_suggestions(self):
        self.assertEqual(detection.suggest_type(detection.GIF, False), "gif")
        self.assertEqual(detection.suggest_type(detection.WEBP, True), "gif")
        self.assertEqual(detection.suggest_type(detection.WEBP, False), "meme")
        self.assertEqual(detection.suggest_type(detection.PNG, False), "meme")
        self.assertEqual(detection.suggest_type(detection.JPEG, False), "meme")
        self.assertEqual(detection.suggest_type(detection.MP4, False), "video")
        self.assertEqual(detection.suggest_type(detection.WEBM, False), "video")
