from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # MinerU
    mineru_url: str = "http://localhost:18000"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "mineru-files"
    minio_secure: bool = False

    # Database
    database_url: str = "sqlite:///./mineru.db"


settings = Settings()
