"""API errors with English, user-facing messages and a stable machine-readable code."""
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.views import exception_handler as drf_exception_handler


class ApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "error"

    def __init__(self, detail, code=None, status_code=None, extra=None):
        super().__init__(detail, code)
        if status_code is not None:
            self.status_code = status_code
        self.extra = extra or {}


class DuplicateItemError(ApiError):
    def __init__(self, existing_id, existing):
        super().__init__(
            "This file is already in your collection.",
            code="duplicate",
            status_code=status.HTTP_409_CONFLICT,
            extra={"existing_id": existing_id, "existing": existing},
        )


def _first_message(data, path=""):
    """First error text of a nested DRF validation payload, prefixed with its field name."""
    if isinstance(data, dict):
        for key, value in data.items():
            found = _first_message(value, f"{path}.{key}" if path else str(key))
            if found:
                return found
    elif isinstance(data, (list, tuple)):
        for value in data:
            found = _first_message(value, path)
            if found:
                return found
    elif data:
        return f"{path}: {data}" if path else str(data)
    return ""


def _validation_payload(data):
    """Serializer errors keep their per-field details but also get the usual detail and code."""
    payload = {"detail": _first_message(data) or "The request was not valid.", "code": "validation_error"}
    if isinstance(data, dict):
        payload["errors"] = data
    return payload


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, ApiError):
        response.data = {"detail": str(exc.detail), "code": exc.detail.code, **exc.extra}
    elif isinstance(exc, ValidationError):
        response.data = _validation_payload(response.data)
    elif response.status_code == 404:
        response.data = {"detail": "The item was not found.", "code": "not_found"}
    elif isinstance(response.data, dict) and "detail" in response.data:
        response.data.setdefault("code", getattr(response.data["detail"], "code", "error"))
    return response
