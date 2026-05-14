'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Cpu,
} from 'lucide-react'
import type { Doc } from '@/lib/types'
import DocumentUpload from './DocumentUpload'

interface Props {
  docs: Doc[]
  onDocAdded: (doc: Doc) => void
}

const statusIcon = (status: Doc['status']) => {
  if (status === 'indexed') return <CheckCircle size={11} className="text-emerald-400 flex-shrink-0" />
  if (status === 'error') return <AlertCircle size={11} className="text-red-400 flex-shrink-0" />
  return <Clock size={11} className="text-amber-400 animate-pulse flex-shrink-0" />
}

export default function Sidebar({ docs, onDocAdded }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  return (
    <>
      <div className="relative flex-shrink-0 h-full" style={{ width: collapsed ? 64 : 220 }}>
        <motion.aside
          animate={{ width: collapsed ? 64 : 220 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="h-full glass border-r border-white/[0.07] flex flex-col overflow-hidden"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.07] flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/10">
              <Cpu size={15} className="text-indigo-400" />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <p className="text-sm font-semibold text-white whitespace-nowrap">AskInternal</p>
                  <p className="text-[10px] text-slate-600 whitespace-nowrap">Enterprise KB</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Section label */}
          <AnimatePresence>
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600"
              >
                Documents
              </motion.p>
            )}
          </AnimatePresence>

          {/* Doc list */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            {docs.length === 0 && !collapsed && (
              <p className="text-[11px] text-slate-700 px-2 py-3 text-center">
                No documents yet
              </p>
            )}
            {docs.map((doc) => (
              <div
                key={doc.job_id}
                title={doc.filename}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-default group"
              >
                <FileText size={13} className="text-indigo-400/70 flex-shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5 min-w-0 flex-1"
                    >
                      <span className="text-[11px] text-slate-400 truncate flex-1">{doc.filename}</span>
                      {statusIcon(doc.status)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Upload button */}
          <div className="p-3 border-t border-white/[0.07] flex-shrink-0">
            <button
              onClick={() => setShowUpload(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/35 text-indigo-400 text-[12px] font-medium transition-all"
            >
              <Upload size={13} />
              {!collapsed && <span>Upload Doc</span>}
            </button>
          </div>
        </motion.aside>

        {/* Collapse toggle — outside aside to avoid overflow clip */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-1/2 -right-3 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#12121e] border border-white/[0.1] flex items-center justify-center hover:bg-[#1a1a2e] transition-colors shadow-lg"
        >
          {collapsed ? (
            <ChevronRight size={11} className="text-slate-500" />
          ) : (
            <ChevronLeft size={11} className="text-slate-500" />
          )}
        </button>
      </div>

      {showUpload && (
        <DocumentUpload
          onClose={() => setShowUpload(false)}
          onUploaded={(doc) => {
            onDocAdded(doc)
            setShowUpload(false)
          }}
        />
      )}
    </>
  )
}
