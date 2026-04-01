import io
import os
from datetime import timedelta
from minio import Minio
from minio.error import S3Error

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "mineru-files")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE,
)


def ensure_bucket():
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)


def upload_file(object_name: str, file_bytes: bytes, content_type: str = "application/octet-stream"):
    ensure_bucket()
    client.put_object(
        MINIO_BUCKET,
        object_name,
        io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=content_type,
    )


def get_presigned_url(object_name: str, expires_seconds: int = 3600) -> str:
    return client.presigned_get_object(
        MINIO_BUCKET,
        object_name,
        expires=timedelta(seconds=expires_seconds),
    )


def delete_file(object_name: str):
    try:
        client.remove_object(MINIO_BUCKET, object_name)
    except S3Error:
        pass
