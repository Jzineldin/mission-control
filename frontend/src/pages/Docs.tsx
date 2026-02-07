import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText, Upload, Search, File, FileCode, FileSpreadsheet,
  Database, HardDrive, Layers
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'

const staticDocs = [
  { id: 'd1', name: 'SOUL.md', type: 'md', size: '4.2 KB', chunks: 12 },
  { id: 'd2', name: 'MEMORY.md', type: 'md', size: '8.7 KB', chunks: 24 },
  { id: 'd3', name: 'AGENTS.md', type: 'md', size: '6.1 KB', chunks: 18 },
  { id: 'd4', name: 'TOOLS.md', type: 'md', size: '5.3 KB', chunks: 15 },
  { id: 'd5', name: 'lead-data.csv', type: 'csv', size: '124 KB', chunks: 89 },
  { id: 'd6', name: 'server.js', type: 'js', size: '7.8 KB', chunks: 22 },
]

const typeIcons: Record<string, any> = { md: FileText, csv: FileSpreadsheet, js: FileCode, default: File }
const typeColors: Record<string, string> = { md: '#007AFF', csv: '#32D74B', js: '#FF9500', default: '#8E8E93' }

export default function Docs() {
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const filteredDocs = staticDocs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalChunks = staticDocs.reduce((acc, d) => acc + d.chunks, 0)

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileText size={22} style={{ color: '#818cf8' }} /> Doc Digest
          </h1>
          <p className="text-body" style={{ marginTop: 8 }}>Document processing & knowledge base</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            { label: 'Documents', value: staticDocs.length, icon: Layers, color: '#007AFF' },
            { label: 'Total Chunks', value: totalChunks, icon: Database, color: '#BF5AF2' },
            { label: 'Index Size', value: 156, suffix: ' KB', icon: HardDrive, color: '#32D74B' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.05} noPad>
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <s.icon size={16} style={{ color: s.color }} />
                  </div>
                  <span className="text-label">{s.label}</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.92)' }}>
                  <AnimatedCounter end={s.value} />{s.suffix && <span className="text-caption">{s.suffix}</span>}
                </p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Upload Zone */}
        <motion.div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={() => setDragOver(false)}
          className="macos-panel"
          style={{
            padding: '36px 24px',
            textAlign: 'center',
            borderStyle: dragOver ? 'solid' : 'dashed',
            borderColor: dragOver ? 'rgba(0,122,255,0.4)' : 'rgba(255,255,255,0.12)',
            background: dragOver ? 'rgba(0,122,255,0.06)' : 'rgba(255,255,255,0.03)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dragOver ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Upload size={20} style={{ color: dragOver ? '#007AFF' : 'rgba(255,255,255,0.4)' }} />
          </div>
          <p className="text-body" style={{ fontWeight: 500 }}>Drag & drop files here, or click to browse</p>
          <p className="text-caption" style={{ marginTop: 6 }}>Supports .md, .txt, .csv, .json, .pdf</p>
        </motion.div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="macos-input"
            style={{ width: '100%', paddingLeft: 44, paddingRight: 16, paddingTop: 12, paddingBottom: 12, fontSize: 13 }}
          />
        </div>

        {/* Document Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {filteredDocs.map((doc, i) => {
            const Icon = typeIcons[doc.type] || typeIcons.default
            const color = typeColors[doc.type] || typeColors.default
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                whileHover={{ y: -3, scale: 1.01 }}
                className="macos-panel"
                style={{ padding: 20, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} style={{ color, opacity: 0.8 }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</h4>
                    <p className="text-caption" style={{ marginTop: 4 }}>{doc.size}  ·  {doc.chunks} chunks</p>
                  </div>
                  <span className="macos-badge" style={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' }}>{doc.type}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </PageTransition>
  )
}
