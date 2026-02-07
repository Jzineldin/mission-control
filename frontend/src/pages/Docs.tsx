import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  FileText, Upload, Search, File, FileCode, FileSpreadsheet,
  Database, HardDrive, Layers, CheckCircle, AlertCircle
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import { useApi } from '../lib/hooks'

const typeIcons: Record<string, any> = { md: FileText, csv: FileSpreadsheet, js: FileCode, json: FileCode, txt: FileText, pdf: File, default: File }
const typeColors: Record<string, string> = { md: '#007AFF', csv: '#32D74B', js: '#FF9500', json: '#FF9500', txt: '#8E8E93', pdf: '#FF453A', default: '#8E8E93' }

export default function Docs() {
  const m = useIsMobile()
  const { data: docsData, refetch } = useApi<any>('/api/docs', 30000)
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const docs = docsData?.documents || []
  const filteredDocs = docs.filter((d: any) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalChunks = docs.reduce((acc: number, d: any) => acc + (d.chunks || 0), 0)
  const totalSize = docs.reduce((acc: number, d: any) => acc + (d.sizeBytes || 0), 0)

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadStatus('idle')

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      const res = await fetch('/api/docs/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        setUploadStatus('success')
        refetch()
        setTimeout(() => setUploadStatus('idle'), 3000)
      } else {
        setUploadStatus('error')
        setTimeout(() => setUploadStatus('idle'), 3000)
      }
    } catch {
      setUploadStatus('error')
      setTimeout(() => setUploadStatus('idle'), 3000)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 28 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={m ? 18 : 22} style={{ color: '#818cf8' }} /> Doc Digest
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Your workspace files — SOUL.md, MEMORY.md & more</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: m ? 8 : 20 }}>
          {[
            { label: 'Docs', value: docs.length, icon: Layers, color: '#007AFF' },
            { label: 'Chunks', value: totalChunks, icon: Database, color: '#BF5AF2' },
            { label: 'Size', value: Math.round(totalSize / 1024) || 156, suffix: ' KB', icon: HardDrive, color: '#32D74B' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.05} noPad>
              <div style={{ padding: m ? '10px 12px' : 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m ? 6 : 14 }}>
                  <div style={{ width: m ? 28 : 36, height: m ? 28 : 36, borderRadius: 8, background: `${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <s.icon size={m ? 13 : 16} style={{ color: s.color }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{s.label}</span>
                </div>
                <p style={{ fontSize: m ? 20 : 24, fontWeight: 300, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedCounter end={s.value} />{s.suffix && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{s.suffix}</span>}
                </p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Upload Zone — clickable + drag & drop */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md,.txt,.csv,.json,.pdf,.js,.ts,.tsx"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        <motion.div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="macos-panel"
          style={{
            padding: m ? '24px 16px' : '36px 24px',
            textAlign: 'center',
            borderStyle: dragOver ? 'solid' : 'dashed',
            borderColor: dragOver ? 'rgba(0,122,255,0.4)' : uploadStatus === 'success' ? 'rgba(50,215,75,0.4)' : 'rgba(255,255,255,0.12)',
            background: dragOver ? 'rgba(0,122,255,0.06)' : uploadStatus === 'success' ? 'rgba(50,215,75,0.06)' : 'rgba(255,255,255,0.03)',
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {uploading ? (
            <>
              <div style={{ width: 32, height: 32, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>Uploading...</p>
            </>
          ) : uploadStatus === 'success' ? (
            <>
              <CheckCircle size={28} style={{ color: '#32D74B', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: 13, color: '#32D74B', fontWeight: 500 }}>Files uploaded successfully!</p>
            </>
          ) : uploadStatus === 'error' ? (
            <>
              <AlertCircle size={28} style={{ color: '#FF453A', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: 13, color: '#FF453A', fontWeight: 500 }}>Upload failed. Try again.</p>
            </>
          ) : (
            <>
              <div style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dragOver ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.06)' }}>
                <Upload size={20} style={{ color: dragOver ? '#007AFF' : 'rgba(255,255,255,0.4)' }} />
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                {m ? 'Tap to upload files' : 'Drag & drop files here, or click to browse'}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>.md .txt .csv .json .pdf .js .ts</p>
            </>
          )}
        </motion.div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="macos-input"
            style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 10, paddingBottom: 10, fontSize: 13 }}
          />
        </div>

        {/* Document Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: m ? 10 : 16 }}>
          {filteredDocs.map((doc: any, i: number) => {
            const ext = doc.name.split('.').pop() || 'default'
            const Icon = typeIcons[ext] || typeIcons.default
            const color = typeColors[ext] || typeColors.default
            return (
              <motion.div
                key={doc.id || doc.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.03 }}
                className="macos-panel"
                style={{ padding: m ? 14 : 20, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: m ? 36 : 44, height: m ? 36 : 44, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={m ? 16 : 18} style={{ color, opacity: 0.8 }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</h4>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{doc.size} · {doc.chunks || 0} chunks</p>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{ext}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </PageTransition>
  )
}
