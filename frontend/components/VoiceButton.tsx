'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Loader2 } from 'lucide-react'

interface Props {
  onRecorded: (blob: Blob) => Promise<void>
  disabled?: boolean
}

export default function VoiceButton({ onRecorded, disabled }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'processing'>('idle')
  const [bars, setBars] = useState<number[]>(Array(18).fill(3))
  const recorderRef = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const chunksRef = useRef<Blob[]>([])
  const ctxRef = useRef<AudioContext | null>(null)

  const startRecording = async () => {
    if (disabled || state !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const draw = () => {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        setBars(Array.from(data.slice(0, 18)).map(v => Math.max(3, (v / 255) * 28)))
        animFrameRef.current = requestAnimationFrame(draw)
      }
      draw()

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        cancelAnimationFrame(animFrameRef.current)
        setBars(Array(18).fill(3))
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setState('processing')
        await onRecorded(blob)
        setState('idle')
      }
      recorder.start()
      recorderRef.current = recorder
      setState('recording')
    } catch {
      console.error('Microphone access denied')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  useEffect(() => () => cancelAnimationFrame(animFrameRef.current), [])

  return (
    <div className="flex items-center gap-2">
      {/* Live waveform bars */}
      <AnimatePresence>
        {state === 'recording' && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-[2px] overflow-hidden"
          >
            {bars.map((h, i) => (
              <motion.div
                key={i}
                animate={{ height: h }}
                transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                className="w-[2px] bg-red-400 rounded-full"
                style={{ minHeight: 3 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button with pulse rings */}
      <div className="relative flex items-center justify-center">
        {state === 'recording' && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-500/30 animate-pulse-ring pointer-events-none" />
            <span className="absolute inset-0 rounded-full bg-red-500/20 animate-pulse-ring-delay pointer-events-none" />
          </>
        )}

        <motion.button
          whileTap={{ scale: 0.88 }}
          onMouseDown={startRecording}
          onMouseUp={state === 'recording' ? stopRecording : undefined}
          onTouchStart={startRecording}
          onTouchEnd={state === 'recording' ? stopRecording : undefined}
          disabled={disabled || state === 'processing'}
          title={state === 'idle' ? 'Hold to record' : state === 'recording' ? 'Release to send' : 'Processing…'}
          className={[
            'relative w-10 h-10 rounded-full flex items-center justify-center transition-all select-none',
            state === 'recording'
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
              : state === 'processing'
              ? 'bg-indigo-500/20 text-indigo-300 cursor-not-allowed'
              : 'bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          {state === 'processing' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : state === 'recording' ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <Mic size={16} />
          )}
        </motion.button>
      </div>
    </div>
  )
}
