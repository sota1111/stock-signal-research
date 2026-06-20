import os
import time
import hmac
import hashlib
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Cookie, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


logger = logging.getLogger(__name__)

router = APIRouter()

_APP_NAME = "stock-signal-research"

# Identity Toolkit REST endpoint for email/password sign-in. The browser never
# talks to Firebase directly anymore; the server verifies credentials here.
_IDENTITY_TOOLKIT_URL = (
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
)
_REST_TIMEOUT_SECONDS = 10.0

# Intermittent login ("できる時とできない時がある") was caused by transient
# Identity Toolkit failures (connect/timeout errors and Firebase 5xx) being
# surfaced immediately as a failed login — and 5xx being misclassified as 401
# invalid credentials. Retry transient failures a few times with backoff before
# giving up, and always treat them as 503 (service issue), never 401.
_MAX_REST_ATTEMPTS = 3
_RETRY_BACKOFF_SECONDS = 0.5


class SessionRequest(BaseModel):
    email: str
    password: str


def _compute_token(secret: str) -> str:
    return hmac.new(
        secret.encode(), f"{_APP_NAME}-auth".encode(), hashlib.sha256
    ).hexdigest()


def _verify_password_via_rest(email: str, password: str) -> str:
    """Verify email/password against Firebase Identity Toolkit REST.

    Returns the authenticated email on success. Raises HTTPException on failure.
    The password is never logged or echoed back in any error message.
    """
    api_key = os.getenv("FIREBASE_WEB_API_KEY") or os.getenv("FIREBASE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="FIREBASE_WEB_API_KEY / FIREBASE_API_KEY not configured",
        )

    # Retry only TRANSIENT failures (network errors / Firebase 5xx). Credential
    # errors (400/401) and rate limiting (429) are deterministic — return them
    # immediately without retrying.
    for attempt in range(1, _MAX_REST_ATTEMPTS + 1):
        try:
            resp = httpx.post(
                _IDENTITY_TOOLKIT_URL,
                params={"key": api_key},
                json={"email": email, "password": password, "returnSecureToken": True},
                timeout=_REST_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError:
            # Connection/timeout error: transient. Retry, then give up as 503.
            if attempt < _MAX_REST_ATTEMPTS:
                logger.warning(
                    "Identity Toolkit request failed (attempt %d/%d), retrying",
                    attempt,
                    _MAX_REST_ATTEMPTS,
                )
                time.sleep(_RETRY_BACKOFF_SECONDS * attempt)
                continue
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="認証サーバに接続できませんでした",
            )

        if resp.status_code == 200:
            data = resp.json()
            return data.get("email", email)

        # Firebase 5xx is a transient server-side fault, NOT a credential error.
        # Retry, then surface as 503 — never as 401, otherwise a correct password
        # is intermittently reported as "wrong".
        if resp.status_code >= 500:
            if attempt < _MAX_REST_ATTEMPTS:
                logger.warning(
                    "Identity Toolkit returned %d (attempt %d/%d), retrying",
                    resp.status_code,
                    attempt,
                    _MAX_REST_ATTEMPTS,
                )
                time.sleep(_RETRY_BACKOFF_SECONDS * attempt)
                continue
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="認証サーバが一時的に利用できません。しばらく待ってから再試行してください",
            )

        # Deterministic (4xx) responses: map to safe errors and stop retrying.
        break

    # Map Identity Toolkit error codes to safe responses (no credential leak).
    error_message = ""
    try:
        error_message = resp.json().get("error", {}).get("message", "")
    except Exception:
        error_message = ""

    if error_message == "TOO_MANY_ATTEMPTS_TRY_LATER":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="ログイン試行が多すぎます。しばらく待ってから再試行してください",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="メールアドレスまたはパスワードが正しくありません",
    )


def get_current_user(auth_token: str = Cookie(None)) -> str:
    auth_secret = os.getenv("AUTH_SECRET")
    if not auth_secret or not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    expected = _compute_token(auth_secret)
    if not hmac.compare_digest(auth_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )
    return "authenticated"


@router.post("/session")
def create_session(request: SessionRequest):
    auth_secret = os.getenv("AUTH_SECRET")
    allowed_emails_str = os.getenv("ALLOWED_USER_EMAILS", "")
    allowed_emails = [e.strip() for e in allowed_emails_str.split(",") if e.strip()]

    if not auth_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AUTH_SECRET not configured",
        )

    email = _verify_password_via_rest(request.email, request.password)

    if allowed_emails and email not in allowed_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not allowed",
        )

    token = _compute_token(auth_secret)
    is_production = os.getenv("APP_ENV", "local") == "production"

    response = JSONResponse(content={"success": True, "email": email})
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    return response


@router.post("/logout")
def logout():
    response = JSONResponse(content={"success": True})
    response.delete_cookie(key="auth_token", path="/")
    return response


@router.get("/me")
def me(current_user: str = Depends(get_current_user)):
    return {"status": "authenticated"}
