from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Item


@receiver(post_delete, sender=Item)
def delete_item_files(sender, instance, **kwargs):
    """Remove media and thumbnail from disk once the row is really gone."""
    files = [instance.file, instance.thumbnail]

    def _remove():
        for f in files:
            if f:
                f.storage.delete(f.name)

    transaction.on_commit(_remove)
