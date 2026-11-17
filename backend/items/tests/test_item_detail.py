from items.models import Item, Tag

from .helpers import MediaTestCase, make_gif, make_mp4, make_png


class PatchTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.item = self.post_file(make_png(), "a.png", tags="alt").data
        self.url = f"/api/items/{self.item['id']}/"

    def patch(self, data):
        return self.client.patch(self.url, data, format="json")

    def test_patch_fields(self):
        res = self.patch(
            {"title": "Neu", "type": "gif", "is_favorite": True, "source_url": "https://example.com/x",
             "tags": ["#Eins", "zwei", "eins"]}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["title"], "Neu")
        self.assertEqual(res.data["type"], "gif")
        self.assertTrue(res.data["is_favorite"])
        self.assertEqual(sorted(res.data["tags"]), ["eins", "zwei"])

    def test_tags_are_lowercase_and_replaced(self):
        self.patch({"tags": ["LAUT"]})
        self.assertEqual(list(Item.objects.get().tags.values_list("name", flat=True)), ["laut"])
        self.assertTrue(Tag.objects.filter(name="laut").exists())

    def test_readonly_fields_are_ignored(self):
        before = self.item["sha256"]
        res = self.patch({"sha256": "x" * 64, "size_bytes": 1})
        self.assertEqual(res.data["sha256"], before)

    def test_invalid_url_and_type(self):
        self.assertEqual(self.patch({"source_url": "not a url"}).status_code, 400)
        self.assertEqual(self.patch({"type": "sticker"}).status_code, 400)

    def test_cannot_turn_image_into_video(self):
        res = self.patch({"type": "video"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "type_mismatch")

    def test_put_is_not_allowed(self):
        self.assertEqual(self.client.put(self.url, {}, format="json").status_code, 405)

    def test_unknown_item(self):
        self.assertEqual(self.client.get("/api/items/9999/").status_code, 404)


class DeleteTests(MediaTestCase):
    def test_delete_removes_row_and_files(self):
        res = self.post_file(make_gif(), "a.gif")
        self.assertEqual(len(self.files_on_disk()), 2)
        with self.captureOnCommitCallbacks(execute=True):
            out = self.client.delete(f"/api/items/{res.data['id']}/")
        self.assertEqual(out.status_code, 204)
        self.assertEqual(Item.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), [])

    def test_delete_keeps_other_items_files(self):
        keep = self.post_file(make_png(), "keep.png")
        drop = self.post_file(make_gif(), "drop.gif")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"/api/items/{drop.data['id']}/")
        self.assertEqual(len(self.files_on_disk()), 2)
        self.assertEqual(self.client.get(f"/api/items/{keep.data['id']}/").status_code, 200)

    def test_delete_video_removes_files(self):
        res = self.post_file(make_mp4(), "a.mp4")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"/api/items/{res.data['id']}/")
        self.assertEqual(self.files_on_disk(), [])

    def test_can_reupload_after_delete(self):
        res = self.post_file(make_png(), "a.png")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"/api/items/{res.data['id']}/")
        self.assertEqual(self.post_file(make_png(), "a.png").status_code, 201)
