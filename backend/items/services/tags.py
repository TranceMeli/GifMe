import re

from ..errors import ApiError
from ..models import Tag

MAX_TAG_LENGTH = 50
MAX_TAGS = 30


def normalize_tags(raw):
    """Accept a list or a comma separated string; return unique lowercase names without '#'."""
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)):
        raise ApiError("Tags must be passed as a list.", code="invalid_tags")
    names = []
    for value in raw:
        if not isinstance(value, str):
            raise ApiError("Tags must be text.", code="invalid_tags")
        # A single list entry may itself hold several comma separated tags.
        for part in value.split(","):
            name = re.sub(r"\s+", " ", part.strip().lstrip("#").strip()).lower()
            if not name:
                continue
            if len(name) > MAX_TAG_LENGTH:
                raise ApiError(
                    f"A tag can be at most {MAX_TAG_LENGTH} characters long.", code="invalid_tags"
                )
            if name not in names:
                names.append(name)
    if len(names) > MAX_TAGS:
        raise ApiError(f"At most {MAX_TAGS} tags per item.", code="invalid_tags")
    return names


def set_item_tags(item, names):
    tags = [Tag.objects.get_or_create(name=n)[0] for n in names]
    item.tags.set(tags)
