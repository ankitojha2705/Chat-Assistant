export interface Citation {
  id: number
  doc: string
  page: number | null
  section: string | null
  snippet: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  latency_ms?: number
  timestamp: Date
  isVoice?: boolean
  sessionId?: string
}

export interface Doc {
  job_id: string
  filename: string
  status: 'processing' | 'indexed' | 'error'
  chunk_count?: number
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessageDB {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[] | null
  created_at: string
}
