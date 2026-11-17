import io

from django.conf import settings
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .errors import ApiError
from .models import Item, Tag
from .serializers import ItemSerializer, TagSerializer
from .services import editing, importer, ingest
from .services.tags import normalize_tags

MAX_TITLE_LENGTH = 200

# Values for ?ordering=; the default (newest first) comes from the model.
ORDERINGS = {
    "newest": ["-created_at", "-id"],
    "oldest": ["created_at", "id"],
    "largest": ["-size_bytes", "-id"],
}


def _truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class ItemViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ItemSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Item.objects.prefetch_related("tags")
        if self.action != "list":
            return qs
        params = self.request.query_params
        return self._ordered(self._filtered(qs, params), params.get("ordering", ""))

    @staticmethod
    def _ordered(qs, ordering):
        if not ordering:
            return qs
        try:
            return qs.order_by(*ORDERINGS[ordering])
        except KeyError:
            raise ApiError("Unknown sort order.", code="invalid_ordering") from None

    @staticmethod
    def _filtered(qs, params, *, with_type=True):
        if with_type and (item_type := params.get("type")):
            qs = qs.filter(type=item_type)
        if _truthy(params.get("favorite", "")):
            qs = qs.filter(is_favorite=True)
        for name in normalize_tags(params.getlist("tag")):
            qs = qs.filter(tags__name=name)
        if text := params.get("q", "").strip():
            qs = qs.filter(
                Q(title__icontains=text)
                | Q(tags__name__icontains=text.lstrip("#"))
                | Q(source_url__icontains=text)
            ).distinct()
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        is_multipart = request.content_type and request.content_type.startswith("multipart/")
        upload = request.FILES.get("file")
        url = (data.get("url") or "").strip() if hasattr(data, "get") else ""
        if not upload and not url:
            raise ApiError(
                "Please upload a file or provide a link.", code="missing_source"
            )
        if upload and url:
            raise ApiError("Please provide either a file or a link, not both.", code="ambiguous_source")

        title = (data.get("title") or "").strip()
        if len(title) > MAX_TITLE_LENGTH:
            raise ApiError(
                f"The title can be at most {MAX_TITLE_LENGTH} characters long.", code="invalid_title"
            )
        raw_tags = data.getlist("tags") if is_multipart else data.get("tags")
        options = {
            "requested_type": (data.get("type") or "").strip(),
            "title": title,
            "tags": normalize_tags(raw_tags),
        }

        if upload:
            if upload.size > settings.MAX_UPLOAD_BYTES:
                raise ingest.too_large()
            source = (data.get("source_url") or "").strip()
            item = ingest.create_item(upload, source_url=source, **options)
        else:
            stream = importer.download(url)
            try:
                item = ingest.create_item(stream, source_url=url, **options)
            finally:
                stream.close()

        item = self.get_queryset().get(pk=item.pk)
        return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        title = serializer.validated_data.get("title", "")
        if len(title) > MAX_TITLE_LENGTH:
            raise ApiError(
                f"The title can be at most {MAX_TITLE_LENGTH} characters long.", code="invalid_title"
            )
        serializer.save()

    @action(detail=False, methods=["get"])
    def counts(self, request):
        """Items per type for the current search and tags; the type filter itself is ignored."""
        qs = self._filtered(Item.objects.all(), request.query_params, with_type=False)
        rows = qs.order_by().values("type").annotate(n=Count("id", distinct=True))
        result = {t: 0 for t in Item.Type.values}
        result.update({row["type"]: row["n"] for row in rows})
        result["total"] = sum(result.values())
        return Response(result)

    @action(detail=True, methods=["get"], url_path="edit-info")
    def edit_info(self, request, pk=None):
        item = self.get_object()
        if item.type == Item.Type.VIDEO:
            raise ApiError("Videos cannot be edited yet.", code="not_editable")
        return Response(editing.frame_info(item))

    @action(detail=True, methods=["post"], url_path="edit/preview")
    def edit_preview(self, request, pk=None):
        data, mime = editing.render(self.get_object(), editing.EditParams.from_data(request.data))
        return HttpResponse(data, content_type=mime)

    @action(detail=True, methods=["post"], url_path="edit")
    def edit(self, request, pk=None):
        """Apply an edit. mode=copy (default) stores a new item, mode=replace overwrites this one."""
        item = self.get_object()
        data, _ = editing.render(item, editing.EditParams.from_data(request.data))
        mode = request.data.get("mode", "copy")
        if mode not in ("copy", "replace"):
            raise ApiError("Unknown save mode.", code="invalid_edit")
        if mode == "replace":
            result = ingest.replace_content(item, io.BytesIO(data))
        else:
            result = ingest.create_item(
                io.BytesIO(data),
                requested_type=item.type,
                title=item.title,
                tags=[t.name for t in item.tags.all()],
                source_url=item.source_url,
            )
        result = self.get_queryset().get(pk=result.pk)
        return Response(
            self.get_serializer(result).data,
            status=status.HTTP_200_OK if mode == "replace" else status.HTTP_201_CREATED,
        )


class TagViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = TagSerializer
    pagination_class = None
    queryset = Tag.objects.annotate(count=Count("items")).filter(count__gt=0)
