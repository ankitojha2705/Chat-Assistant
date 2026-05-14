import type { Citation, Doc } from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const AUTH = { Authorization: 'Bearer dev-token' }

export async function queryText(query: string): Promise<{
  answer: string
  citations: Citation[]
  latency_ms: number
}> {
  const res = await fetch(`${API}/text/query`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function queryVoice(blob: Blob): Promise<{
  transcript: string
  answer: string
  citations: Citation[]
  latency_ms: number
}> {
  const fd = new FormData()
  fd.append('audio', blob, 'recording.webm')
  const res = await fetch(`${API}/voice/query`, {
    method: 'POST',
    headers: AUTH,
    body: fd,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
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
