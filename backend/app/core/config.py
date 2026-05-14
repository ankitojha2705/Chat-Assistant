from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenAI
    openai_api_key: str
    embedding_model: str = "text-embedding-3-large"
    stt_model: str = "gpt-4o-transcribe"

    embedding_dimensions: int = 1536  # truncated via Matryoshka — stays within HNSW 2000-dim limit

    # LLM model for answer generation (OpenAI)
    llm_model: str = "gpt-4o"

    # PostgreSQL (asyncpg driver)
    database_url: str = "postgresql+asyncpg://chatbot:chatbot@localhost:5432/chatbot"

    # Redis
    redis_url: str = "redis://localhost:6379"
    cache_ttl: int = 600  # seconds

    # Auth — set to empty string to disable JWT validation in local dev
    jwks_url: str = ""
    jwt_audience: str = ""

    # Observability
    otel_endpoint: str = ""  # e.g. "http://localhost:4317"

    debug: bool = False


settings = Settings()
