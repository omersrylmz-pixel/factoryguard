"""Auth endpoint'leri.

Access token yanıt gövdesinde döner (istemci bellekte tutar). Refresh token yalnızca
HttpOnly + SameSite=Strict cookie olarak, sadece /api/v1/auth yoluna gönderilir; JavaScript okuyamaz.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, client_ip
from app.core.security import create_access_token
from app.models import User
from app.modules.audit.service import record
from app.modules.auth import service
from app.modules.auth.schemas import LoginRequest, MeResponse, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "fg_refresh"
COOKIE_PATH = "/api/v1/auth"


def _set_cookie(response: Response, raw: str) -> None:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=s.refresh_token_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH, httponly=True, samesite="strict",
                           secure=get_settings().cookie_secure)


def _token_response(db, user: User) -> TokenResponse:
    token, expires = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        expires_in=expires,
        user=UserOut(id=user.id, email=user.email, full_name=user.full_name),
        organizations=service.user_organizations(db, user.id),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    email = body.email.lower()
    ip = client_ip(request)
    if service.throttle.is_locked(email):
        record(db, "auth.login_locked", metadata={"email": email}, ip_address=ip)
        db.commit()
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.")
    user, found = service.authenticate(db, email, body.password)
    if user is None:
        service.throttle.fail(email)
        record(db, "auth.login_failed", user_id=found.id if found else None,
               metadata={"email": email}, ip_address=ip)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-posta veya parola hatalı")
    service.throttle.reset(email)
    raw = service.issue_refresh_token(db, user.id)
    record(db, "auth.login", user_id=user.id, target_type="user", target_id=user.id, ip_address=ip)
    db.commit()
    _set_cookie(response, raw)
    return _token_response(db, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    db: DbSession,
    fg_refresh: Annotated[str | None, Cookie()] = None,
):
    if not fg_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Oturum bulunamadı")
    try:
        user, raw = service.rotate_refresh_token(db, fg_refresh)
    except service.RefreshError as exc:
        if exc.reason == "reuse_detected":
            record(db, "auth.refresh_reuse_detected", user_id=exc.user_id, ip_address=client_ip(request))
        db.commit()
        _clear_cookie(response)
        # Cookie temizliğinin istemciye ulaşması için yanıtı doğrudan döndür.
        resp = Response(status_code=status.HTTP_401_UNAUTHORIZED,
                        content='{"detail":"Oturum süresi doldu, tekrar giriş yapın"}',
                        media_type="application/json")
        _clear_cookie(resp)
        return resp
    db.commit()
    _set_cookie(response, raw)
    return _token_response(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db: DbSession,
    fg_refresh: Annotated[str | None, Cookie()] = None,
):
    if fg_refresh:
        user_id = service.revoke_token(db, fg_refresh)
        if user_id:
            record(db, "auth.logout", user_id=user_id, ip_address=client_ip(request))
        db.commit()
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_cookie(resp)
    return resp


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser, db: DbSession):
    return MeResponse(
        user=UserOut(id=user.id, email=user.email, full_name=user.full_name),
        organizations=service.user_organizations(db, user.id),
    )
