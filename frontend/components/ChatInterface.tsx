'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, Zap } from 'lucide-react'
import type { Message, Doc } from '@/lib/types'
import { queryText, queryVoice } from '@/lib/api'
import MessageBubble from './MessageBubble'
import VoiceButton from './VoiceButton'
import Sidebar from './Sidebar'

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm your internal knowledge assistant. Ask me anything about company documents — I'll find the answer and cite exactly where it came from.",
  timestamp: new Date(),
}

const SUGGESTIONS = [
  'How many vacation days do employees get?',
  'What is the remote work policy?',
  'What are the password requirements?',
  'What happens during a performance review?',
]

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState<Doc[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const pushMessage = (msg: Message) => setMessages((prev) => [...prev, msg])

  const sendText = useCallback(
    async (query: string) => {
      const q = query.trim()
      if (!q || loading) return
      pushMessage({ id: crypto.randomUUID(), role: 'user', content: q, timestamp: new Date() })
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      setLoading(true)
      try {
        const data = await queryText(q)
        pushMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
          latency_ms: data.latency_ms,
          timestamp: new Date(),
        })
      } catch {
        pushMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '⚠️ Something went wrong. Make sure the backend is running at localhost:8000.',
          timestamp: new Date(),
        })
      } finally {
        setLoading(false)
      }
    },
    [loading]
  )

  const sendVoice = useCallback(
    async (blob: Blob) => {
      setLoading(true)
      try {
        const data = await queryVoice(blob)
        pushMessage({
          id: crypto.randomUUID(),
          role: 'user',
          content: data.transcript,
          timestamp: new Date(),
          isVoice: true,
        })
        pushMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
          latency_ms: data.latency_ms,
          timestamp: new Date(),
        })
      } catch {
        pushMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '⚠️ Voice query failed. Check microphone permissions and backend connectivity.',
          timestamp: new Date(),
        })
      } finally {
        setLoading(false)
      }
    },
    [loading]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendText(input)
    }
  }

  const autoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 128)}px`
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar docs={docs} onDocAdded={(doc) => setDocs((prev) => [doc, ...prev])} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] glass">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <Sparkles size={13} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">Enterprise Knowledge Chat</p>
              <p className="text-[10px] text-slate-600">RAG · Hybrid Search · Citations</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            <span>Live</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>

          {/* Typing / searching indicator */}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap size={13} className="text-indigo-400" />
              </div>
              <div className="glass border border-white/[0.07] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-3">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500">Searching knowledge base…</span>
              </div>
            </motion.div>
          )}

          {/* Suggestion chips — shown only on welcome state */}
          {messages.length === 1 && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="flex flex-wrap gap-2 justify-center pt-2"
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendText(s)}
                  className="px-4 py-2 rounded-full glass border border-white/[0.08] text-xs text-slate-400 hover:text-slate-200 hover:border-indigo-500/30 hover:bg-indigo-500/[0.06] transition-all"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.06]">
          <div className="glass border border-white/[0.09] focus-within:border-indigo-500/40 rounded-2xl px-4 py-3 flex items-end gap-3 transition-colors duration-200">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={autoResize}
              placeholder="Ask about your internal documents…"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none leading-relaxed disabled:opacity-40 max-h-32"
            />

            <div className="flex items-center gap-2 pb-0.5 flex-shrink-0">
              <VoiceButton onRecorded={sendVoice} disabled={loading} />

              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => sendText(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.05] disabled:text-slate-700 text-white"
              >
                <Send size={14} />
              </motion.button>
            </div>
          </div>

          <p className="text-[10px] text-slate-700 text-center mt-2">
            Hold mic button to record · Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  )
}
