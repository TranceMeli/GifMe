from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path("api/", include("items.urls")),
]

# The dev server serves uploaded media; the Vite proxy forwards /media here.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
