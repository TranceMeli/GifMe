import io

from PIL import Image

from items.models import Item

from .helpers import MediaTestCase, make_mp4, make_png


def make_numbered_gif(frames=6, duration=100, size=(40, 20)):
    """Each frame has a distinct red value so order can be checked after editing."""
    imgs = [Image.new("RGB", size, (i * 40, 0, 0)) for i in range(frames)]
    out = io.BytesIO()
    imgs[0].save(out, "GIF", save_all=True, append_images=imgs[1:], duration=duration, loop=0)
    return out.getvalue()


def read_gif(response_or_bytes):
    data = response_or_bytes if isinstance(response_or_bytes, bytes) else response_or_bytes.content
    img = Image.open(io.BytesIO(data))
    frames = []
    for i in range(img.n_frames):
        img.seek(i)
        frames.append((img.convert("RGB").getpixel((0, 0))[0], img.info.get("duration")))
    return img.size, frames


class EditTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.item = self.post_file(make_numbered_gif(), "a.gif", title="Original", tags="lol").data
        self.base = f"/api/items/{self.item['id']}/"

    def preview(self, **data):
        return self.client.post(self.base + "edit/preview/", data, format="json")

    def test_edit_info(self):
        res = self.client.get(self.base + "edit-info/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["frame_count"], 6)
        self.assertEqual(res.data["duration_ms"], 600)

    def test_trim_frames(self):
        res = self.preview(start=1, end=3)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/gif")
        _, frames = read_gif(res)
        self.assertEqual(len(frames), 3)

    def test_reverse(self):
        _, forward = read_gif(self.preview())
        _, backward = read_gif(self.preview(reverse=True))
        self.assertEqual([f[0] for f in backward], [f[0] for f in reversed(forward)])

    def test_speed_changes_durations(self):
        _, frames = read_gif(self.preview(speed=2))
        self.assertTrue(all(d == 50 for _, d in frames))
        _, frames = read_gif(self.preview(speed=0.5))
        self.assertTrue(all(d == 200 for _, d in frames))

    def test_crop_scale_rotate_dimensions(self):
        size, _ = read_gif(self.preview(crop={"left": 25, "right": 25}))
        self.assertEqual(size, (20, 20))
        size, _ = read_gif(self.preview(scale=50))
        self.assertEqual(size, (20, 10))
        size, _ = read_gif(self.preview(rotate=90))
        self.assertEqual(size, (20, 40))

    def test_invalid_parameters(self):
        for bad in ({"speed": 10}, {"scale": 5}, {"rotate": 45}, {"start": 4, "end": 2},
                    {"crop": {"left": 60}}, {"speed": "fast"}):
            res = self.preview(**bad)
            self.assertEqual(res.status_code, 400, bad)
            self.assertEqual(res.data["code"], "invalid_edit")

    def test_save_as_copy_keeps_original(self):
        res = self.client.post(self.base + "edit/", {"end": 2, "mode": "copy"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotEqual(res.data["id"], self.item["id"])
        self.assertEqual(res.data["tags"], ["lol"])
        self.assertEqual(res.data["title"], "Original")
        self.assertEqual(res.data["type"], "gif")
        self.assertEqual(Item.objects.count(), 2)
        self.assertEqual(len(self.files_on_disk()), 4)

    def test_save_replace_swaps_files(self):
        old = Item.objects.get(pk=self.item["id"])
        old_names = {old.file.name, old.thumbnail.name}
        res = self.client.post(self.base + "edit/", {"end": 1, "mode": "replace"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["id"], self.item["id"])
        self.assertNotEqual(res.data["sha256"], self.item["sha256"])
        self.assertEqual(Item.objects.count(), 1)
        disk = {str(p.relative_to(self.media_root)).replace("\\", "/") for p in self.files_on_disk()}
        self.assertEqual(len(disk), 2)
        self.assertFalse(disk & old_names)
        item = Item.objects.get()
        with item.file.open("rb") as f:
            self.assertEqual(Image.open(f).n_frames, 2)

    def test_noop_copy_is_a_duplicate_or_equal(self):
        # Re-encoding a GIF may change its bytes; either outcome must be handled cleanly.
        res = self.client.post(self.base + "edit/", {"mode": "copy"}, format="json")
        self.assertIn(res.status_code, (201, 409))

    def test_still_image_edit(self):
        png = self.post_file(make_png(size=(100, 50)), "m.png").data
        res = self.client.post(
            f"/api/items/{png['id']}/edit/preview/", {"crop": {"top": 20, "bottom": 20}, "scale": 50}, format="json"
        )
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertEqual(Image.open(io.BytesIO(res.content)).size, (50, 15))

    def test_video_is_not_editable(self):
        video = self.post_file(make_mp4(), "v.mp4").data
        for method, url in (("get", "edit-info/"), ("post", "edit/preview/"), ("post", "edit/")):
            res = getattr(self.client, method)(f"/api/items/{video['id']}/{url}", {}, format="json")
            self.assertEqual(res.status_code, 400, url)
            self.assertEqual(res.data["code"], "not_editable")

    def test_unknown_mode(self):
        res = self.client.post(self.base + "edit/", {"mode": "overwrite"}, format="json")
        self.assertEqual(res.status_code, 400)
