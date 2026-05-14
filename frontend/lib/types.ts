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
}

export interface Doc {
  job_id: string
  filename: string
  status: 'processing' | 'indexed' | 'error'
  chunk_count?: number
}
