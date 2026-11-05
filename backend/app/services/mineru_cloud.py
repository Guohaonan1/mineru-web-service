"""Compatibility imports for the existing mineru.net routes."""

from app.services.adapters.cloud import (
    fetch_and_parse_zip,
    get_batch_status,
    submit_batch,
    submit_url_batch,
    upload_file_to_slot,
)

__all__ = ["fetch_and_parse_zip", "get_batch_status", "submit_batch", "submit_url_batch", "upload_file_to_slot"]
