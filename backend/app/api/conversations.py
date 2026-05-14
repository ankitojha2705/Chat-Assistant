from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.database import ChatMessage, Conversation, get_db
from app.models.schemas import ChatMessageOut, ConversationOut

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/", response_model=list[ConversationOut])
async def list_conversations(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Conversation]:
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.sub)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())


@router.get("/{conv_id}/messages", response_model=list[ChatMessageOut])
async def get_messages(
    conv_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessage]:
    conv = await db.get(Conversation, conv_id)
    if not conv or conv.user_id != user.sub:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(result.scalars().all())


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    conv = await db.get(Conversation, conv_id)
    if not conv or conv.user_id != user.sub:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == conv_id))
    await db.delete(conv)
    await db.commit()
    return {"ok": True}
