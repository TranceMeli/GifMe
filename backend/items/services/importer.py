"""Server-side URL import with scheme, address, size, time and content-type checks."""
import ipaddress
import socket
import tempfile
import urllib.error
import urllib.request
from urllib.parse import urlparse

from django.conf import settings

from ..errors import ApiError
from .detection import ALLOWED_MIME_TYPES
from .ingest import too_large

CHUNK = 64 * 1024
MAX_REDIRECTS = 5


def validate_url(url: str):
    """Allow only http(s) URLs that do not point to private or local addresses."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ApiError("Only http and https links are allowed.", code="invalid_url")
    if settings.ALLOW_PRIVATE_URLS:
        return
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 80, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ApiError("The address could not be resolved.", code="url_unreachable") from exc
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ApiError(
                "Links to local or private addresses are not allowed.", code="invalid_url"
            )


class _CheckedRedirects(urllib.request.HTTPRedirectHandler):
    max_redirections = MAX_REDIRECTS

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_url(url: str):
    """Open the URL with a timeout. Separate function so tests can replace the network."""
    opener = urllib.request.build_opener(_CheckedRedirects)
    request = urllib.request.Request(url, headers={"User-Agent": "GifMeCollector/1.0"})
    return opener.open(request, timeout=settings.URL_IMPORT_TIMEOUT)


def download(url: str):
    """Download to a temporary file. Returns the open file (caller closes it)."""
    validate_url(url)
    limit = settings.MAX_UPLOAD_BYTES
    try:
        response = open_url(url)
    except ApiError:
        raise
    except urllib.error.HTTPError as exc:
        raise ApiError(
            f"The server responded with error {exc.code}.", code="url_unreachable"
        ) from exc
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise ApiError(
            "The link could not be loaded (timeout or unreachable).",
            code="url_unreachable",
        ) from exc

    with response:
        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type not in ALLOWED_MIME_TYPES:
            raise ApiError(
                "The link does not point to a supported image or video.",
                code="unsupported_type",
            )
        declared = response.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > limit:
            raise too_large()
        tmp = tempfile.TemporaryFile()
        try:
            total = 0
            while chunk := response.read(CHUNK):
                total += len(chunk)
                if total > limit:
                    raise too_large()
                tmp.write(chunk)
        except (OSError, ApiError) as exc:
            tmp.close()
            if isinstance(exc, ApiError):
                raise
            raise ApiError("The download was interrupted.", code="url_unreachable") from exc
    tmp.seek(0)
    return tmp
