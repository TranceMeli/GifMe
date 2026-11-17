"""Ingest edge cases and the shape of the HTTP API contract."""
import glob
import io
import os
import tempfile
from unittest import mock

from django.db import IntegrityError
from django.test import override_settings

from items.errors import DuplicateItemError
from items.models import Item, Tag
from items.services import ingest

from .helpers import MediaTestCase, make_gif, make_png


def temp_files():
    return set(glob.glob(os.path.join(tempfile.gettempdir(), "gifme_*")))


class IngestTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.png_a, self.png_b = make_png((10, 10, 10)), make_png((200, 200, 200))
        self.a = self.post_file(self.png_a, "a.png", title="A", tags="one").data
        self.b = self.post_file(self.png_b, "b.png", title="B").data

    def test_replace_with_identical_bytes_changes_nothing(self):
        item = Item.objects.get(pk=self.a["id"])
        before = self.files_on_disk()
        result = ingest.replace_content(item, io.BytesIO(self.png_a))
        self.assertEqual(result.pk, item.pk)
        self.assertEqual(self.files_on_disk(), before)

    def test_replace_with_the_bytes_of_another_item_is_a_duplicate(self):
        item = Item.objects.get(pk=self.a["id"])
        with self.assertRaises(DuplicateItemError) as ctx:
            ingest.replace_content(item, io.BytesIO(self.png_b))
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.extra["existing_id"], self.b["id"])
        item.refresh_from_db()
        self.assertEqual(item.sha256, self.a["sha256"])

    def test_replace_updates_hash_size_and_dimensions_and_removes_old_files(self):
        item = Item.objects.get(pk=self.a["id"])
        old_names = {item.file.name, item.thumbnail.name}
        ingest.replace_content(item, io.BytesIO(make_png((1, 2, 3), size=(20, 10))))
        item.refresh_from_db()
        self.assertEqual((item.width, item.height), (20, 10))
        self.assertNotEqual(item.sha256, self.a["sha256"])
        on_disk = {str(p.relative_to(self.media_root)).replace(os.sep, "/") for p in self.files_on_disk()}
        self.assertFalse(old_names & on_disk)
        self.assertIn(item.file.name, on_disk)

    def test_concurrent_insert_is_reported_as_duplicate_and_leaves_no_files(self):
        before = self.files_on_disk()
        no_match = mock.Mock()
        no_match.first.return_value = None
        # Skip the up-front duplicate check so the unique index is what catches the clash.
        with mock.patch.object(Item.objects, "filter", return_value=no_match):
            with self.assertRaises(DuplicateItemError) as ctx:
                ingest.create_item(io.BytesIO(self.png_a))
        self.assertEqual(ctx.exception.extra["existing_id"], self.a["id"])
        self.assertEqual(self.files_on_disk(), before)

    def test_storage_failure_removes_partial_files(self):
        before = self.files_on_disk()
        with mock.patch.object(ingest, "set_item_tags", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                ingest.create_item(io.BytesIO(make_png((7, 7, 7))), tags=["x"])
        self.assertEqual(self.files_on_disk(), before)
        self.assertEqual(Item.objects.count(), 2)

    def test_temp_files_are_cleaned_up_after_success_and_failure(self):
        before = temp_files()
        ingest.create_item(io.BytesIO(make_png((9, 9, 9))))
        with self.assertRaises(DuplicateItemError):
            ingest.create_item(io.BytesIO(self.png_a))
        with self.assertRaises(Exception):
            ingest.create_item(io.BytesIO(b"not an image"))
        self.assertEqual(temp_files(), before)

    @override_settings(MAX_UPLOAD_BYTES=10)
    def test_oversized_stream_is_rejected_and_temp_file_removed(self):
        before = temp_files()
        with self.assertRaises(Exception) as ctx:
            ingest.spool_to_disk(io.BytesIO(b"x" * 50))
        self.assertEqual(ctx.exception.status_code, 413)
        self.assertEqual(temp_files(), before)

    def test_spool_returns_hash_and_size(self):
        path, digest, size = ingest.spool_to_disk(io.BytesIO(b"hello"))
        try:
            self.assertEqual(size, 5)
            self.assertEqual(digest, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
            self.assertEqual(path.read_bytes(), b"hello")
        finally:
            path.unlink()


class ContractTests(MediaTestCase):
    def test_item_representation_has_the_documented_fields(self):
        res = self.post_file(make_gif(), "a.gif", title="T", tags="x,y", source_url="https://e.example/a")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            set(res.data),
            {"id", "type", "title", "tags", "is_favorite", "source_url", "width", "height",
             "size_bytes", "sha256", "created_at", "file_url", "thumbnail_url"},
        )
        self.assertTrue(res.data["file_url"].startswith("/media/items/"))
        self.assertTrue(res.data["file_url"].endswith(".gif"))
        self.assertTrue(res.data["thumbnail_url"].startswith("/media/thumbs/"))
        self.assertTrue(res.data["thumbnail_url"].endswith(".jpg"))
        self.assertEqual(res.data["tags"], ["x", "y"])
        self.assertEqual(len(res.data["sha256"]), 64)

    def test_errors_carry_detail_and_code(self):
        for res in (
            self.client.post("/api/items/", {}, format="json"),
            self.client.get("/api/items/?ordering=nope"),
            self.client.get("/api/items/12345/"),
        ):
            self.assertIn("detail", res.data)
            self.assertIn("code", res.data)

    def test_not_found_message(self):
        res = self.client.get("/api/items/12345/")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data, {"detail": "The item was not found.", "code": "not_found"})

    def test_error_messages_are_english(self):
        responses = [
            self.client.post("/api/items/", {}, format="json"),
            self.client.post("/api/items/", {"url": "ftp://x.example/a.gif"}, format="json"),
            self.client.get("/api/items/?ordering=nope"),
            self.post_file(b"", "empty.png"),
            self.post_file(b"plain text", "a.png"),
        ]
        for res in responses:
            self.assertEqual(res.status_code, 400)
            self.assertTrue(str(res.data["detail"]).isascii(), res.data["detail"])

    def test_file_and_url_together_are_ambiguous(self):
        res = self.client.post(
            "/api/items/",
            {"file": io.BytesIO(make_png()), "url": "https://example.com/a.png"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "ambiguous_source")

    def test_title_length_limit_on_create_and_update(self):
        res = self.post_file(make_png(), "a.png", title="x" * 201)
        self.assertEqual((res.status_code, res.data["code"]), (400, "invalid_title"))
        ok = self.post_file(make_png(), "a.png", title="x" * 200)
        self.assertEqual(ok.status_code, 201)
        res = self.client.patch(f"/api/items/{ok.data['id']}/", {"title": "y" * 201}, format="json")
        self.assertEqual((res.status_code, res.data["code"]), (400, "validation_error"))
        self.assertTrue(res.data["detail"].startswith("title: "))

    def test_serializer_errors_get_detail_code_and_field_details(self):
        item = self.post_file(make_png(), "a.png").data
        res = self.client.patch(f"/api/items/{item['id']}/", {"source_url": "not a url"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "validation_error")
        self.assertTrue(res.data["detail"].startswith("source_url: "))
        self.assertIn("source_url", res.data["errors"])

    def test_invalid_tags_are_rejected_on_update(self):
        item = self.post_file(make_png(), "a.png").data
        res = self.client.patch(f"/api/items/{item['id']}/", {"tags": "not-a-list-but-a-string-is-ok"}, format="json")
        self.assertEqual(res.status_code, 200)
        res = self.client.patch(f"/api/items/{item['id']}/", {"tags": [1, 2]}, format="json")
        self.assertEqual((res.status_code, res.data["code"]), (400, "invalid_tags"))
        res = self.client.patch(f"/api/items/{item['id']}/", {"tags": {"a": 1}}, format="json")
        self.assertEqual((res.status_code, res.data["code"]), (400, "invalid_tags"))

    def test_second_page_continues_without_overlap(self):
        for i in range(3):
            self.post_file(make_png((i * 50, 0, 0)), f"{i}.png")
        first = self.client.get("/api/items/?page_size=2").data
        second = self.client.get("/api/items/?page_size=2&page=2").data
        ids = [i["id"] for i in first["results"]] + [i["id"] for i in second["results"]]
        self.assertEqual(len(ids), 3)
        self.assertEqual(len(set(ids)), 3)
        self.assertIsNone(second["next"])

    def test_oversized_page_size_is_capped(self):
        res = self.client.get("/api/items/?page_size=100000")
        self.assertEqual(res.status_code, 200)

    def test_counts_follow_search_tags_and_favorites(self):
        a = self.post_file(make_png((1, 1, 1)), "a.png", title="cat", tags="pet").data
        self.post_file(make_gif(), "b.gif", title="dog", tags="pet")
        self.post_file(make_png((9, 9, 9)), "c.png", title="rock")
        self.client.patch(f"/api/items/{a['id']}/", {"is_favorite": True}, format="json")
        self.assertEqual(self.client.get("/api/items/counts/?tag=pet").data,
                         {"gif": 1, "meme": 1, "video": 0, "total": 2})
        self.assertEqual(self.client.get("/api/items/counts/?q=rock").data["total"], 1)
        self.assertEqual(self.client.get("/api/items/counts/?favorite=true").data["total"], 1)
        self.assertEqual(self.client.get("/api/items/counts/?tag=missing").data["total"], 0)

    def test_ordering_is_stable_for_equal_sort_keys(self):
        a = self.post_file(make_png((1, 1, 1), size=(8, 8)), "a.png").data
        b = self.post_file(make_png((2, 2, 2), size=(8, 8)), "b.png").data
        ids = [i["id"] for i in self.client.get("/api/items/?ordering=largest").data["results"]]
        sizes = {a["id"]: a["size_bytes"], b["id"]: b["size_bytes"]}
        self.assertEqual(ids, sorted(ids, key=lambda pk: (-sizes[pk], -pk)))

    def test_preview_returns_an_image_and_stores_nothing(self):
        item = self.post_file(make_gif(4), "a.gif").data
        files = self.files_on_disk()
        res = self.client.post(f"/api/items/{item['id']}/edit/preview/", {"speed": 2}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/gif")
        self.assertTrue(res.content.startswith(b"GIF"))
        self.assertEqual(self.files_on_disk(), files)
        self.assertEqual(Item.objects.count(), 1)

    def test_unsupported_methods(self):
        item = self.post_file(make_png(), "a.png").data
        self.assertEqual(self.client.post(f"/api/items/{item['id']}/", {}, format="json").status_code, 405)
        self.assertEqual(self.client.put(f"/api/items/{item['id']}/", {}, format="json").status_code, 405)
        self.assertEqual(self.client.post("/api/tags/", {"name": "x"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete("/api/tags/").status_code, 405)


class ModelTests(MediaTestCase):
    def test_tag_names_are_stored_lowercase(self):
        tag = Tag.objects.create(name="MiXeD")
        self.assertEqual(tag.name, "mixed")
        self.assertEqual(str(tag), "mixed")

    def test_item_string_uses_title_or_type_and_id(self):
        titled = self.post_file(make_png(), "a.png", title="Funny").data
        plain = self.post_file(make_gif(), "b.gif").data
        self.assertEqual(str(Item.objects.get(pk=titled["id"])), "Funny")
        self.assertEqual(str(Item.objects.get(pk=plain["id"])), f"gif {plain['id']}")

    def test_unused_tags_disappear_from_the_tag_list(self):
        item = self.post_file(make_png(), "a.png", tags="solo,shared").data
        other = self.post_file(make_png((5, 5, 5)), "b.png", tags="shared").data
        names = {t["name"]: t["count"] for t in self.client.get("/api/tags/").data}
        self.assertEqual(names, {"solo": 1, "shared": 2})
        self.client.delete(f"/api/items/{item['id']}/")
        names = {t["name"]: t["count"] for t in self.client.get("/api/tags/").data}
        self.assertEqual(names, {"shared": 1})
        self.assertTrue(other["id"])

    def test_newest_item_is_first_by_default_ordering(self):
        first = self.post_file(make_png((1, 1, 1)), "a.png").data
        second = self.post_file(make_png((2, 2, 2)), "b.png").data
        self.assertEqual([i.pk for i in Item.objects.all()], [second["id"], first["id"]])
