import uuid

from django.db import models


def item_file_path(instance, filename):
    """Store under a fresh uuid name; the client file name is never used."""
    ext = instance.stored_extension
    name = uuid.uuid4().hex
    return f"items/{name[:2]}/{name}{ext}"


def item_thumb_path(instance, filename):
    return f"thumbs/{uuid.uuid4().hex}.jpg"


class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = self.name.lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Item(models.Model):
    class Type(models.TextChoices):
        GIF = "gif", "Gif"
        MEME = "meme", "Meme"
        VIDEO = "video", "Video"

    file = models.FileField(upload_to=item_file_path)
    thumbnail = models.FileField(upload_to=item_thumb_path, blank=True)
    type = models.CharField(max_length=5, choices=Type.choices)
    title = models.CharField(max_length=200, blank=True)
    sha256 = models.CharField(max_length=64, unique=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    size_bytes = models.PositiveBigIntegerField()
    is_favorite = models.BooleanField(default=False)
    source_url = models.URLField(max_length=2000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    tags = models.ManyToManyField(Tag, related_name="items", blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    # Set by the ingest service before the first save; drives the stored extension.
    stored_extension = ""

    def __str__(self):
        return self.title or f"{self.type} {self.pk}"
