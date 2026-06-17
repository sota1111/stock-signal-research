"""Tests for server-side REST email/password authentication (案1).

The browser no longer talks to Firebase directly; the server verifies credentials
against Identity Toolkit REST. These tests mock the REST call so no network access
is required.
"""
import httpx
import pytest

from app import auth


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


@pytest.fixture
def auth_env(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-key-for-auth-1234567890")
    monkeypatch.setenv("FIREBASE_WEB_API_KEY", "test-web-api-key")
    monkeypatch.setenv("ALLOWED_USER_EMAILS", "")
    monkeypatch.setenv("APP_ENV", "test")


def test_session_valid_credentials_sets_cookie(client, auth_env, monkeypatch):
    def fake_post(url, params=None, json=None, timeout=None):
        # password must never be logged; just confirm it is forwarded to REST
        assert json["email"] == "user@example.com"
        assert json["password"] == "correct-password"
        return _FakeResponse(200, {"email": "user@example.com", "idToken": "x"})

    monkeypatch.setattr(auth.httpx, "post", fake_post)

    res = client.post(
        "/api/auth/session",
        json={"email": "user@example.com", "password": "correct-password"},
    )
    assert res.status_code == 200
    assert res.json()["email"] == "user@example.com"
    assert "auth_token" in res.cookies


def test_session_invalid_credentials_returns_401(client, auth_env, monkeypatch):
    def fake_post(url, params=None, json=None, timeout=None):
        return _FakeResponse(400, {"error": {"message": "INVALID_LOGIN_CREDENTIALS"}})

    monkeypatch.setattr(auth.httpx, "post", fake_post)

    res = client.post(
        "/api/auth/session",
        json={"email": "user@example.com", "password": "wrong"},
    )
    assert res.status_code == 401
    assert "auth_token" not in res.cookies


def test_session_too_many_attempts_returns_429(client, auth_env, monkeypatch):
    def fake_post(url, params=None, json=None, timeout=None):
        return _FakeResponse(400, {"error": {"message": "TOO_MANY_ATTEMPTS_TRY_LATER"}})

    monkeypatch.setattr(auth.httpx, "post", fake_post)

    res = client.post(
        "/api/auth/session",
        json={"email": "user@example.com", "password": "wrong"},
    )
    assert res.status_code == 429


def test_session_email_not_allowed_returns_403(client, auth_env, monkeypatch):
    monkeypatch.setenv("ALLOWED_USER_EMAILS", "allowed@example.com")

    def fake_post(url, params=None, json=None, timeout=None):
        return _FakeResponse(200, {"email": "user@example.com"})

    monkeypatch.setattr(auth.httpx, "post", fake_post)

    res = client.post(
        "/api/auth/session",
        json={"email": "user@example.com", "password": "correct-password"},
    )
    assert res.status_code == 403


def test_session_missing_api_key_returns_500(client, monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-key-for-auth-1234567890")
    monkeypatch.delenv("FIREBASE_WEB_API_KEY", raising=False)

    res = client.post(
        "/api/auth/session",
        json={"email": "user@example.com", "password": "correct-password"},
    )
    assert res.status_code == 500


def test_session_rest_unreachable_returns_503(client, auth_env, monkeypatch):
    def fake_post(url, params=None, json=None, timeout=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(auth.httpx, "post", fake_post)

    res = client.post(
        "/api/auth/session",
        json={"email": "user@example.com", "password": "correct-password"},
    )
    assert res.status_code == 503
