import io

from openai import AsyncOpenAI

from app.core.config import settings

_client = AsyncOpenAI(api_key=settings.openai_api_key)


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio bytes to text using OpenAI gpt-4o-transcribe."""
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    response = await _client.audio.transcriptions.create(
        model=settings.stt_model,
        file=audio_file,
        response_format="verbose_json",
    )
    return response.text
