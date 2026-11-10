from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class OrganizationMembershipOut(BaseModel):
    id: uuid.UUID
    name: str
    role: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str


class MeResponse(BaseModel):
    user: UserOut
    organizations: list[OrganizationMembershipOut]


class TokenResponse(MeResponse):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
