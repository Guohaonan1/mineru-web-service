import io
from datetime import timedelta
from minio import Minio
from minio.error import S3Error

from app.config import settings

client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


def ensure_bucket():
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def upload_file(object_name: str, file_bytes: bytes, content_type: str = "application/octet-stream"):
    ensure_bucket()
    client.put_object(
        settings.minio_bucket,
        object_name,
        io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=content_type,
    )


def get_presigned_url(object_name: str, expires_seconds: int = 3600) -> str:
    return client.presigned_get_object(
        settings.minio_bucket,
        object_name,
        expires=timedelta(seconds=expires_seconds),
    )


def delete_file(object_name: str):
    try:
        client.remove_object(settings.minio_bucket, object_name)
    except S3Error:
        pass
