'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileText, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { ingestFile } from '@/lib/api'
import type { Doc } from '@/lib/types'

const ALLOWED_EXT = ['pdf', 'docx', 'pptx', 'txt', 'html', 'md']

interface Props {
  onClose: () => void
  onUploaded: (doc: Doc) => void
}

export default function DocumentUpload({ onClose, onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dept, setDept] = useState('general')
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXT.includes(ext)) {
      setError(`Unsupported file type .${ext}. Use: ${ALLOWED_EXT.join(', ')}`)
      return
    }
    setError('')
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const upload = async () => {
    if (!file) return
    setUploadState('uploading')
    setError('')
    try {
      const doc = await ingestFile(file, dept.trim() || 'general')
      setUploadState('done')
      setTimeout(() => onUploaded(doc), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadState('error')
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="glass border border-white/10 rounded-2xl p-6 w-full max-w-md relative shadow-2xl"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.08] transition-all"
          >
            <X size={15} />
          </button>

          <h2 className="text-base font-semibold text-white mb-1">Upload Document</h2>
          <p className="text-xs text-slate-500 mb-5">
            Supported: PDF, DOCX, PPTX, TXT, HTML, MD
          </p>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={[
              'relative rounded-xl border-2 border-dashed transition-all duration-200 p-8 text-center mb-4 cursor-pointer',
              isDragging
                ? 'border-indigo-500 bg-indigo-500/10'
                : file
                ? 'border-emerald-500/40 bg-emerald-500/[0.05]'
                : 'border-white/[0.1] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
            ].join(' ')}
          >
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.html,.md"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <FileText size={22} className="text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-emerald-300 truncate max-w-[200px]">{file.name}</p>
                <p className="text-xs text-slate-600">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center">
                  <Upload size={22} className="text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">Drop file here or click to browse</p>
                <p className="text-xs text-slate-600">Max 50 MB</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {/* Department */}
          <input
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="Department (e.g. hr, engineering, legal)"
            className="w-full px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/50 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors mb-4"
          />

          {/* Upload button */}
          <button
            onClick={upload}
            disabled={!file || uploadState === 'uploading' || uploadState === 'done'}
            className={[
              'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all',
              uploadState === 'done'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.05] disabled:text-slate-600 disabled:cursor-not-allowed text-white',
            ].join(' ')}
          >
            {uploadState === 'uploading' && <Loader2 size={15} className="animate-spin" />}
            {uploadState === 'done' && <CheckCircle size={15} />}
            {uploadState === 'uploading' ? 'Uploading…' : uploadState === 'done' ? 'Uploaded!' : 'Upload Document'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
