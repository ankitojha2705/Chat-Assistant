import type { Citation, ChatMessageDB, Conversation, Doc } from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const AUTH = { Authorization: 'Bearer dev-token' }

export async function queryText(query: string, conversationId?: string): Promise<{
  answer: string
  citations: Citation[]
  conversation_id: string
  latency_ms: number
}> {
  const res = await fetch(`${API}/text/query`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, conversation_id: conversationId ?? null }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function queryVoice(blob: Blob, conversationId?: string): Promise<{
  transcript: string
  answer: string
  citations: Citation[]
  conversation_id: string
  latency_ms: number
}> {
  const fd = new FormData()
  fd.append('audio', blob, 'recording.webm')
  if (conversationId) fd.append('conversation_id', conversationId)
  const res = await fetch(`${API}/voice/query`, {
    method: 'POST',
    headers: AUTH,
    body: fd,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API}/conversations/`, { headers: AUTH })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getConversationMessages(convId: string): Promise<ChatMessageDB[]> {
  const res = await fetch(`${API}/conversations/${convId}/messages`, { headers: AUTH })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteConversation(convId: string): Promise<void> {
  const res = await fetch(`${API}/conversations/${convId}`, { method: 'DELETE', headers: AUTH })
  if (!res.ok) throw new Error(await res.text())
}

export async function ingestFile(file: File, dept = 'general'): Promise<Doc> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('dept', dept)
  const res = await fetch(`${API}/documents/ingest`, {
    method: 'POST',
    headers: AUTH,
    body: fd,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDocStatus(jobId: string): Promise<Doc> {
  const res = await fetch(`${API}/documents/status/${jobId}`, { headers: AUTH })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
