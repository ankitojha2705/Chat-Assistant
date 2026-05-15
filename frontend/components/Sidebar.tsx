'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Upload, CheckCircle, Clock, AlertCircle,
  ChevronLeft, ChevronRight, Cpu, MessageSquare,
  Plus, Trash2, LayoutList,
} from 'lucide-react'
import type { Conversation, Doc } from '@/lib/types'
import { deleteConversation, getDocStatus } from '@/lib/api'
import DocumentUpload from './DocumentUpload'

interface Props {
  conversations: Conversation[]
  activeConversationId?: string
  docs: Doc[]
  onNewChat: () => void
  onSelectConversation: (conv: Conversation) => void
  onDeleteConversation: (id: string) => void
  onDocAdded: (doc: Doc) => void
  onDocUpdated: (doc: Doc) => void
}

function groupByDate(convs: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const week = new Date(today.getTime() - 6 * 86400000)

  const groups: Record<string, Conversation[]> = {
    Today: [], Yesterday: [], 'Previous 7 days': [], Older: [],
  }
  for (const c of convs) {
    const d = new Date(c.updated_at)
    if (d >= today) groups['Today'].push(c)
    else if (d >= yesterday) groups['Yesterday'].push(c)
    else if (d >= week) groups['Previous 7 days'].push(c)
    else groups['Older'].push(c)
  }
  return groups
}

export default function Sidebar({
  conversations, activeConversationId, docs,
  onNewChat, onSelectConversation, onDeleteConversation, onDocAdded, onDocUpdated,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<'chats' | 'docs'>('chats')
  const [showUpload, setShowUpload] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll every 3s for any docs still processing — stop when all are done
  useEffect(() => {
    const processing = docs.filter(d => d.status === 'processing')
    if (processing.length === 0) return

    intervalRef.current = setInterval(async () => {
      const updates = await Promise.allSettled(
        processing.map(d => getDocStatus(d.job_id))
      )
      updates.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.status !== processing[i].status) {
          onDocUpdated({ ...processing[i], status: result.value.status as Doc['status'] })
        }
      })
    }, 3000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [docs])

  const groups = groupByDate(conversations)

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteConversation(id)
    onDeleteConversation(id)
  }

  return (
    <>
      <div className="relative flex-shrink-0 h-full" style={{ width: collapsed ? 64 : 240 }}>
        <motion.aside
          animate={{ width: collapsed ? 64 : 240 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="h-full glass border-r border-white/[0.07] flex flex-col overflow-hidden"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.07] flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
              <Cpu size={15} className="text-indigo-400" />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-sm font-semibold text-white whitespace-nowrap">AskInternal</p>
                  <p className="text-[10px] text-slate-600 whitespace-nowrap">Enterprise KB</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* New Chat button */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <button
              onClick={onNewChat}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/25 text-indigo-300 text-[12px] font-medium transition-all justify-center"
            >
              <Plus size={14} />
              {!collapsed && <span>New Chat</span>}
            </button>
          </div>

          {/* Tabs */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex gap-1 px-3 mb-2 flex-shrink-0"
              >
                {(['chats', 'docs'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={[
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all capitalize',
                      tab === t
                        ? 'bg-white/[0.08] text-slate-200'
                        : 'text-slate-600 hover:text-slate-400',
                    ].join(' ')}
                  >
                    {t === 'chats' ? <MessageSquare size={11} /> : <LayoutList size={11} />}
                    {t}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">

            {/* Chats tab */}
            {(tab === 'chats' || collapsed) && (
              <>
                {conversations.length === 0 && !collapsed && (
                  <p className="text-[11px] text-slate-700 text-center py-6">No conversations yet</p>
                )}
                {Object.entries(groups).map(([label, items]) =>
                  items.length === 0 ? null : (
                    <div key={label}>
                      {!collapsed && (
                        <p className="text-[10px] uppercase tracking-widest text-slate-700 px-2 pt-3 pb-1">
                          {label}
                        </p>
                      )}
                      {items.map((conv) => (
                        <div
                          key={conv.id}
                          onClick={() => onSelectConversation(conv)}
                          onMouseEnter={() => setHoveredId(conv.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          className={[
                            'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                            activeConversationId === conv.id
                              ? 'bg-indigo-500/15 border border-indigo-500/20'
                              : 'hover:bg-white/[0.05]',
                          ].join(' ')}
                          title={conv.title}
                        >
                          <MessageSquare size={12} className="text-slate-600 flex-shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="text-[12px] text-slate-400 truncate flex-1">{conv.title}</span>
                              {hoveredId === conv.id && (
                                <button
                                  onClick={(e) => handleDelete(e, conv.id)}
                                  className="flex-shrink-0 text-slate-700 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            )}

            {/* Docs tab */}
            {tab === 'docs' && !collapsed && (
              <>
                {docs.length === 0 && (
                  <p className="text-[11px] text-slate-700 text-center py-6">No documents yet</p>
                )}
                {docs.map((doc) => (
                  <div
                    key={doc.job_id}
                    title={doc.filename}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                  >
                    <FileText size={13} className="text-indigo-400/70 flex-shrink-0" />
                    <span className="text-[11px] text-slate-400 truncate flex-1">{doc.filename}</span>
                    {doc.status === 'indexed' && <CheckCircle size={11} className="text-emerald-400 flex-shrink-0" />}
                    {doc.status === 'error' && <AlertCircle size={11} className="text-red-400 flex-shrink-0" />}
                    {doc.status === 'processing' && <Clock size={11} className="text-amber-400 animate-pulse flex-shrink-0" />}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Upload button (docs tab only) */}
          {tab === 'docs' && !collapsed && (
            <div className="p-3 border-t border-white/[0.07] flex-shrink-0">
              <button
                onClick={() => setShowUpload(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-[12px] font-medium transition-all"
              >
                <Upload size={13} />
                <span>Upload Doc</span>
              </button>
            </div>
          )}
        </motion.aside>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-1/2 -right-3 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#12121e] border border-white/[0.1] flex items-center justify-center hover:bg-[#1a1a2e] transition-colors shadow-lg"
        >
          {collapsed
            ? <ChevronRight size={11} className="text-slate-500" />
            : <ChevronLeft size={11} className="text-slate-500" />}
        </button>
      </div>

      {showUpload && (
        <DocumentUpload
          onClose={() => setShowUpload(false)}
          onUploaded={(doc) => { onDocAdded(doc); setShowUpload(false) }}
        />
      )}
    </>
  )
}
