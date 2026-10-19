from datetime import UTC, datetime

from sqlalchemy import Column, DateTime


def utcnow() -> datetime:
    return datetime.now(UTC)


def timestamp_column() -> Column:
    return Column(DateTime(timezone=True), nullable=False)
