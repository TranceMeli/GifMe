from .helpers import MediaTestCase, make_gif, make_mp4, make_png


class ItemListTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.cat = self.post_file(make_png((1, 1, 1)), "a.png", title="Grumpy Cat", tags="katze,montag").data
        self.coffee = self.post_file(
            make_gif(), "b.gif", title="Kaffee", tags="kaffee,montag", source_url="https://giphy.example/coffee"
        ).data
        self.clip = self.post_file(make_mp4(), "c.mp4", title="Feier", tags="party").data
        self.client.patch(f"/api/items/{self.clip['id']}/", {"is_favorite": True}, format="json")

    def ids(self, query=""):
        res = self.client.get(f"/api/items/{query}")
        self.assertEqual(res.status_code, 200)
        return [i["id"] for i in res.data["results"]]

    def test_newest_first(self):
        self.assertEqual(self.ids(), [self.clip["id"], self.coffee["id"], self.cat["id"]])

    def test_filter_by_type(self):
        self.assertEqual(self.ids("?type=gif"), [self.coffee["id"]])
        self.assertEqual(self.ids("?type=meme"), [self.cat["id"]])
        self.assertEqual(self.ids("?type=video"), [self.clip["id"]])

    def test_filter_by_tag_is_and_combined(self):
        self.assertEqual(self.ids("?tag=montag"), [self.coffee["id"], self.cat["id"]])
        self.assertEqual(self.ids("?tag=montag&tag=katze"), [self.cat["id"]])
        self.assertEqual(self.ids("?tag=%23Katze"), [self.cat["id"]])
        self.assertEqual(self.ids("?tag=unknown"), [])

    def test_search_title_tags_and_source(self):
        self.assertEqual(self.ids("?q=grumpy"), [self.cat["id"]])
        self.assertEqual(self.ids("?q=party"), [self.clip["id"]])
        self.assertEqual(self.ids("?q=giphy"), [self.coffee["id"]])
        # Matches through two tags must not produce duplicate rows.
        self.assertEqual(self.ids("?q=mon"), [self.coffee["id"], self.cat["id"]])

    def test_filter_favorites(self):
        self.assertEqual(self.ids("?favorite=true"), [self.clip["id"]])

    def test_filters_combine(self):
        self.assertEqual(self.ids("?type=gif&q=kaffee&tag=montag"), [self.coffee["id"]])
        self.assertEqual(self.ids("?type=meme&q=kaffee"), [])

    def test_ordering(self):
        self.assertEqual(self.ids("?ordering=oldest"), [self.cat["id"], self.coffee["id"], self.clip["id"]])
        self.assertEqual(self.ids("?ordering=newest"), [self.clip["id"], self.coffee["id"], self.cat["id"]])
        sizes = {i["id"]: i["size_bytes"] for i in (self.cat, self.coffee, self.clip)}
        expected = sorted(sizes, key=lambda pk: (-sizes[pk], -pk))
        self.assertEqual(self.ids("?ordering=largest"), expected)

    def test_unknown_ordering_is_rejected(self):
        res = self.client.get("/api/items/?ordering=random")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "invalid_ordering")

    def test_counts_per_type_ignore_the_type_filter(self):
        res = self.client.get("/api/items/counts/")
        self.assertEqual(res.data, {"gif": 1, "meme": 1, "video": 1, "total": 3})
        res = self.client.get("/api/items/counts/?type=gif&tag=montag")
        self.assertEqual(res.data, {"gif": 1, "meme": 1, "video": 0, "total": 2})
        res = self.client.get("/api/items/counts/?q=mon")
        self.assertEqual(res.data["total"], 2)

    def test_pagination(self):
        res = self.client.get("/api/items/?page_size=2")
        self.assertEqual(res.data["count"], 3)
        self.assertEqual(len(res.data["results"]), 2)
        self.assertIsNotNone(res.data["next"])

    def test_tags_endpoint(self):
        res = self.client.get("/api/tags/")
        self.assertEqual(res.status_code, 200)
        counts = {t["name"]: t["count"] for t in res.data}
        self.assertEqual(counts, {"katze": 1, "montag": 2, "kaffee": 1, "party": 1})
