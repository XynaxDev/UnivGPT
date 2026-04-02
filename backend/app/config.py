import re
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json


BASE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    # App Config
    project_name: str = "UnivGPT"
    environment: str = "development"
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:4173,"
        "http://127.0.0.1:4173,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )
    frontend_app_url: str = "http://localhost:5173"
    oauth_redirect_path: str = "/auth/callback"
    academic_email_domains: str = "krmu.edu.in"
    require_verified_academic_email_for_queries: bool = False

    # Supabase (Auth & Core Data)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_offline_mode: bool = False
    enable_dummy_auth: bool = False

    # Pinecone (Fast Vector Search)
    pinecone_api_key: str = ""
    pinecone_index_name: str = "unigpt-index"
    pinecone_query_timeout_seconds: int = 6

    # LLM (Generation via OpenRouter)
    openrouter_api_key: str = ""
    openrouter_model: str = "arcee-ai/trinity-large-preview:free"
    openrouter_intent_model: str = "z-ai/glm-4.5-air:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_fallback_models: str = ""
    openrouter_timeout_seconds: int = 20
    openrouter_max_retries: int = 2
    openrouter_retry_backoff_seconds: float = 0.8

    # Embeddings (Local HuggingFace model)
    embedding_model_name: str = "all-MiniLM-L6-v2"
    preload_embeddings_on_startup: bool = True

    # Dev flags
    mock_llm: bool = False

    # SMTP (Email)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "UnivGPT Support"
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 20

    @field_validator(
        "supabase_url",
        "supabase_anon_key",
        "supabase_service_role_key",
        "supabase_jwt_secret",
        "openrouter_api_key",
        "smtp_user",
        "smtp_password",
        "smtp_from_email",
        mode="before",
    )
    @classmethod
    def strip_wrapping_quotes(cls, value: str | None) -> str:
        if value is None:
            return ""
        return str(value).strip().strip('"').strip("'")

    @field_validator("supabase_url", mode="before")
    @classmethod
    def normalize_supabase_url(cls, value: str | None) -> str:
        if value is None:
            return ""
        raw = str(value).strip().strip('"').strip("'").rstrip("/")
        if not raw:
            return raw

        https_project_ref = re.fullmatch(r"https://([a-z0-9-]+)", raw)
        if https_project_ref and not raw.endswith(".supabase.co"):
            return f"https://{https_project_ref.group(1)}.supabase.co"

        project_ref = re.fullmatch(r"[a-z0-9-]+", raw)
        if project_ref:
            return f"https://{project_ref.group(0)}.supabase.co"

        return raw

    @property
    def cors_origins_list(self) -> list[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def openrouter_fallback_models_list(self) -> List[str]:
        raw = (self.openrouter_fallback_models or "").strip()
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
