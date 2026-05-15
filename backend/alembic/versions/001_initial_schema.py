"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "documents",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("dept", sa.String, server_default="general"),
        sa.Column("sensitivity", sa.String, server_default="internal"),
        sa.Column("status", sa.String, server_default="processing"),
        sa.Column("chunk_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("doc_id", sa.String, nullable=False, index=True),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("page", sa.Integer, nullable=True),
        sa.Column("section", sa.String, nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.Text, nullable=False),   # stored as vector(1536)
        sa.Column("allowed_groups", sa.ARRAY(sa.String), server_default="{}"),
        sa.Column("dept", sa.String, server_default="general"),
        sa.Column("sensitivity", sa.String, server_default="internal"),
    )

    op.create_table(
        "conversations",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("user_id", sa.String, nullable=False, index=True),
        sa.Column("title", sa.String, server_default="New Conversation"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("conversation_id", sa.String, nullable=False, index=True),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("citations", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # Indexes for vector and full-text search (created by init_db via pgvector)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_chunks_fts
        ON document_chunks USING gin(to_tsvector('english', content))
    """)


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("conversations")
    op.drop_table("document_chunks")
    op.drop_table("documents")
