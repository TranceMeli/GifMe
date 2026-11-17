"""The API speaks English. This keeps stray German messages from slipping back in."""
import ast
import re
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

PACKAGE = Path(__file__).resolve().parent.parent
GERMAN_WORDS = [
    "Bitte", "Datei", "Dateien", "Der", "Die", "Das", "nicht", "oder", "und", "für", "wird", "werden",
    "Fehler", "Typ", "Titel", "Sammlung", "Zuschnitt", "Drehung", "Ungültiger", "Wert", "Höchstens",
    "Videos können", "Unbekannter", "Link", "Adresse", "Server hat",
]
WORD = re.compile(r"(?<![^\W\d_])(%s)(?![^\W\d_])" % "|".join(re.escape(w) for w in GERMAN_WORDS))


def source_files():
    return [p for p in PACKAGE.rglob("*.py") if "tests" not in p.parts and "migrations" not in p.parts]


def string_literals(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value.strip():
            yield node.lineno, node.value


class ApiLanguageTests(SimpleTestCase):
    def test_finds_the_source_files(self):
        self.assertGreater(len(source_files()), 10)

    def test_no_umlauts_in_the_code(self):
        offenders = [p.name for p in source_files() if re.search("[äöüÄÖÜß]", p.read_text(encoding="utf-8"))]
        self.assertEqual(offenders, [])

    def test_no_german_words_in_string_literals(self):
        hits = []
        for path in source_files():
            for line, value in string_literals(path):
                # Only text that reads like a sentence or message is checked; identifiers are skipped.
                if " " not in value.strip():
                    continue
                match = WORD.search(value)
                if match:
                    hits.append(f"{path.name}:{line} {match.group(1)}")
        self.assertEqual(hits, [])

    def test_django_language_is_english(self):
        self.assertTrue(settings.LANGUAGE_CODE.startswith("en"))
