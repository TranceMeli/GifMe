from items.models import Item

from .helpers import MediaTestCase, make_gif, make_png


class DuplicateTests(MediaTestCase):
    def test_same_content_returns_409_with_existing_item(self):
        first = self.post_file(make_png(), "one.png")
        second = self.post_file(make_png(), "renamed.png")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.data["code"], "duplicate")
        self.assertEqual(second.data["existing_id"], first.data["id"])
        self.assertEqual(second.data["existing"]["id"], first.data["id"])
        self.assertEqual(Item.objects.count(), 1)

    def test_duplicate_leaves_no_extra_files(self):
        self.post_file(make_png(), "one.png")
        before = self.files_on_disk()
        self.post_file(make_png(), "two.png")
        self.assertEqual(self.files_on_disk(), before)

    def test_different_content_is_not_a_duplicate(self):
        self.assertEqual(self.post_file(make_png((1, 2, 3)), "a.png").status_code, 201)
        self.assertEqual(self.post_file(make_png((9, 8, 7)), "b.png").status_code, 201)
        self.assertEqual(self.post_file(make_gif(), "c.gif").status_code, 201)
        self.assertEqual(Item.objects.count(), 3)
