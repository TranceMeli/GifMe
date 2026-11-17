from rest_framework import serializers

from .errors import ApiError
from .models import Item, Tag
from .services.tags import normalize_tags, set_item_tags


class TagListField(serializers.Field):
    """Tags as a list of plain names in both directions."""

    def to_representation(self, value):
        return [t.name for t in value.all()]

    def to_internal_value(self, data):
        return normalize_tags(data)


class ItemSerializer(serializers.ModelSerializer):
    tags = TagListField(required=False)
    file_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id", "type", "title", "tags", "is_favorite", "source_url",
            "width", "height", "size_bytes", "sha256", "created_at",
            "file_url", "thumbnail_url",
        ]
        read_only_fields = ["id", "width", "height", "size_bytes", "sha256", "created_at"]

    def get_file_url(self, obj):
        return obj.file.url if obj.file else None

    def get_thumbnail_url(self, obj):
        return obj.thumbnail.url if obj.thumbnail else None

    def validate_type(self, value):
        # Changing the type after upload must still match the stored content.
        if self.instance is not None:
            is_video_file = self.instance.type == Item.Type.VIDEO
            if (value == Item.Type.VIDEO) != is_video_file:
                raise ApiError("The selected type does not match the file content.", code="type_mismatch")
        return value

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags", None)
        instance = super().update(instance, validated_data)
        if tags is not None:
            set_item_tags(instance, tags)
        return instance


class TagSerializer(serializers.ModelSerializer):
    count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tag
        fields = ["name", "count"]
