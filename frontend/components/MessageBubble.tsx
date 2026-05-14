'use client'

import { motion } from 'framer-motion'
import { Bot, User, Volume2, Clock, FileText } from 'lucide-react'
import type { Message, Citation } from '@/lib/types'

function CitationBadge({ id, citation }: { id: number; citation: Citation }) {
  return (
    <span className="relative group inline-block mx-0.5 align-middle">
      <sup className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-indigo-500/25 text-indigo-300 text-[10px] font-bold cursor-default hover:bg-indigo-500/40 transition-colors">
        {id}
      </sup>
      {/* Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 glass-strong rounded-xl p-3 text-xs invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 pointer-events-none shadow-2xl border border-white/10">
        <span className="block font-semibold text-indigo-300 mb-1 truncate">
          {citation.doc}
          {citation.page ? ` · p.${citation.page}` : ''}
        </span>
        <span className="text-slate-400 leading-relaxed line-clamp-3">{citation.snippet}</span>
      </span>
    </span>
  )
}

function renderWithCitations(text: string, citations: Citation[]) {
  const parts = text.split(/(\[\d+\])/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (m) {
      const citId = parseInt(m[1])
      const cit = citations.find((c) => c.id === citId)
      if (cit) return <CitationBadge key={i} id={citId} citation={cit} />
    }
    return <span key={i}>{part}</span>
  })
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const hasCitations = !isUser && message.citations && message.citations.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-gradient-to-br from-indigo-600/50 to-purple-600/50 border border-indigo-500/30'
            : 'glass border border-white/10'
        }`}
      >
        {isUser ? (
          <User size={13} className="text-indigo-200" />
        ) : (
          <Bot size={13} className="text-slate-400" />
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1.5 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Voice label */}
        {isUser && message.isVoice && (
          <span className="flex items-center gap-1 text-[10px] text-slate-600 px-1">
            <Volume2 size={9} /> Voice
          </span>
        )}

        {/* Bubble */}
        <div
          className={[
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-gradient-to-br from-indigo-600/55 to-purple-700/55 border border-indigo-500/25 text-slate-100 rounded-tr-sm'
              : 'glass border border-white/[0.07] text-slate-200 rounded-tl-sm',
          ].join(' ')}
        >
          {isUser
            ? message.content
            : renderWithCitations(message.content, message.citations ?? [])}
        </div>

        {/* Citation cards */}
        {hasCitations && (
          <div className="flex flex-col gap-1 w-full mt-0.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-700 px-1 mb-0.5">
              Sources
            </p>
            {message.citations!.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs"
              >
                <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center">
                  {c.id}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <FileText size={10} className="text-slate-600 flex-shrink-0" />
                    <p className="text-slate-400 font-medium truncate">
                      {c.doc}
                      {c.page ? ` · p.${c.page}` : ''}
                    </p>
                  </div>
                  <p className="text-slate-600 mt-0.5 line-clamp-2">{c.snippet}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Latency */}
        {!isUser && message.latency_ms != null && (
          <span className="flex items-center gap-1 text-[10px] text-slate-700 px-1">
            <Clock size={9} /> {message.latency_ms}ms
          </span>
        )}
      </div>
    </motion.div>
  )
}
