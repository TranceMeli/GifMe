from rest_framework.routers import SimpleRouter

from .views import ItemViewSet, TagViewSet

router = SimpleRouter()
router.register("items", ItemViewSet, basename="item")
router.register("tags", TagViewSet, basename="tag")

urlpatterns = router.urls
