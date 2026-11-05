"""Compatibility imports for existing v3 routes."""

from app.services.adapters.v3 import (
    check_health,
    fetch_task_result,
    get_task_status,
    parse_file,
    submit_task,
)

__all__ = ["check_health", "fetch_task_result", "get_task_status", "parse_file", "submit_task"]
