"""Settings for the local GifMeCollector API. Tunable values come from environment variables."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default):
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.environ.get("GIFME_SECRET_KEY", "dev-only-secret-key-change-me")
DEBUG = env_bool("GIFME_DEBUG", True)
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

INSTALLED_APPS = [
    "rest_framework",
    "items",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Europe/Berlin"
USE_I18N = False
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("GIFME_MEDIA_ROOT", BASE_DIR / "media"))

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    # Local single-user app: no login, therefore no session or CSRF handling.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_PAGINATION_CLASS": "items.pagination.ItemPagination",
    "PAGE_SIZE": 48,
    "EXCEPTION_HANDLER": "items.errors.exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# Upload and import limits
MAX_UPLOAD_MB = int(os.environ.get("GIFME_MAX_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
URL_IMPORT_TIMEOUT = int(os.environ.get("GIFME_URL_TIMEOUT", "15"))
# Importing from private network addresses is blocked unless explicitly enabled.
ALLOW_PRIVATE_URLS = env_bool("GIFME_ALLOW_PRIVATE_URLS", False)

THUMBNAIL_SIZE = 400
FFMPEG_BIN = os.environ.get("GIFME_FFMPEG", "ffmpeg")
FFPROBE_BIN = os.environ.get("GIFME_FFPROBE", "ffprobe")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
