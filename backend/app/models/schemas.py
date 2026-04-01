"""
UniGPT Pydantic Models
Request/response schemas for all API endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ─── Enums ───


class UserRole(str, Enum):
    STUDENT = "student"
    FACULTY = "faculty"
    ADMIN = "admin"


class DocType(str, Enum):
    STUDENT = "student"
    FACULTY = "faculty"
    ADMIN = "admin"
    PUBLIC = "public"


# ─── Auth Models ───


class InitiateSignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    department: Optional[str] = None
    role: UserRole = UserRole.STUDENT


class VerifySignupRequest(BaseModel):
    email: str
    otp: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str


class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[UserRole] = None


class InviteRequest(BaseModel):
    email: str
    full_name: str
    role: UserRole
    department: Optional[str] = None


class RoleSelectionRequest(BaseModel):
    role: UserRole


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    department: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None
    academic_verified: bool = False
    identity_provider: Optional[str] = None


class SignupResponse(BaseModel):
    message: str
    email: str


class MessageResponse(BaseModel):
    message: str
    status: str = "success"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


# ─── Document Models ───


class DocumentUploadMeta(BaseModel):
    doc_type: DocType
    department: str
    course: str
    tags: list[str] = Field(default_factory=list)


class DocumentResponse(BaseModel):
    id: str
    filename: str
    doc_type: DocType
    department: Optional[str] = None
    course: Optional[str] = None
    tags: list = Field(default_factory=list)
    visibility: bool = True
    uploaded_at: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
    page: int = 1
    per_page: int = 20


# ─── Agent / Chat Models ───


class AgentQueryRequest(BaseModel):
    query: str
    context: Optional[dict] = None  # { dept, course }
    conversation_id: Optional[str] = None


class SourceCitation(BaseModel):
    document_id: str
    title: str
    snippet: str
    relevance_score: Optional[float] = None
    metadata: Optional[dict] = Field(default_factory=dict)


class AgentQueryResponse(BaseModel):
    answer: str
    sources: list[SourceCitation] = Field(default_factory=list)
    conversation_id: str
    role_badge: str  # "Student Agent" / "Faculty Agent" / "Admin Agent"
    rationale: Optional[str] = None


class ConversationResponse(BaseModel):
    id: str
    title: str
    role: UserRole
    messages: list[dict] = Field(default_factory=list)
    summary: Optional[str] = None
    last_active: Optional[str] = None


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int


# ─── Audit Models ───


class AuditLogEntry(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    payload: dict = Field(default_factory=dict)
    timestamp: Optional[str] = None


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogEntry]
    total: int
    page: int = 1
    per_page: int = 50


# ─── Health ───


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    environment: str = "development"


class MetricsResponse(BaseModel):
    total_documents: int = 0
    total_embeddings: int = 0
    total_conversations: int = 0
    total_users: int = 0
