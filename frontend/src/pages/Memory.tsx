import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, FileText, Clock, Search, ArrowLeft, Database, HardDrive, Calendar, Settings2, User, Heart, Pencil, Eye, Save, X } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import { useIsMobile } from '../lib/useIsMobile'
import { useApi, timeAgo } from '../lib/hooks'
import { renderMarkdown } from '../lib/markdown'
import HelpTooltip from '../components/HelpTooltip'

interface MemoryFile {
  name: string
  path: string
  size: number
  lastModified: string
  type: 'root' | 'memory'
}

const fileIcons: Record<string, { icon: any; color: string }> = {
  'MEMORY.md': { icon: Brain, color: '#BF5AF2' },
  'SOUL.md': { icon: Heart, color: '#FF453A' },
  'USER.md': { icon: User, color: '#007AFF' },
  'IDENTITY.md': { icon: User, color: '#32D74B' },
  'TOOLS.md': { icon: Settings2, color: '#FF9500' },
  'HEARTBEAT.md': { icon: Heart, color: '#FFD60A' },
  'AGENTS.md': { icon: Settings2, color: '#64D2FF' },
}

function getFileIcon(name: string) {
  if (fileIcons[name]) return fileIcons[name]
  if (name.match(/^\d{4}-\d{2}-\d{2}\.md$/)) return { icon: Calendar, color: '#007AFF' }
  if (name.endsWith('.json')) return { icon: Database, color: '#FF9500' }
  return { icon: FileText, color: '#8E8E93' }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Memory() {
  const m = useIsMobile()
  const { data: docsData, loading } = useApi<{ documents: MemoryFile[]; totalSize: number }>('/api/docs', 30000)
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [editContent, setEditContent] = useState<string>('')
  const [contentLoading, setContentLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [search, setSearch] = useState('')

  const docs = docsData?.documents || []
  const totalSize = docsData?.totalSize || 0

  // Group files
  const coreFiles = docs.filter(d => d.type === 'root').sort((a, b) => a.name.localeCompare(b.name))
  const dailyFiles = docs.filter(d => d.type === 'memory' && d.name.match(/^\d{4}-\d{2}-\d{2}\.md$/)).sort((a, b) => b.name.localeCompare(a.name))
  const stateFiles = docs.filter(d => d.type === 'memory' && !d.name.match(/^\d{4}-\d{2}-\d{2}\.md$/)).sort((a, b) => a.name.localeCompare(b.name))

  const filteredCore = search ? coreFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : coreFiles
  const filteredDaily = search ? dailyFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : dailyFiles
  const filteredState = search ? stateFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : stateFiles

  const openFile = async (file: MemoryFile) => {
    setSelectedFile(file)
    setContentLoading(true)
    setIsEditing(false)
    setSaveStatus('idle')
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(file.path)}`)
      const data = await res.json()
      setFileContent(data.content || '')
      setEditContent(data.content || '')
    } catch {
      setFileContent('Failed to load file content.')
      setEditContent('')
    }
    setContentLoading(false)
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(selectedFile.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      })
      if (res.ok) {
        setFileContent(editContent)
        setIsEditing(false)
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
    setSaving(false)
  }

  // File viewer
  if (selectedFile) {
    const canEdit = selectedFile.name.endsWith('.md')
    return (
      <PageTransition>
        <div style={{ maxWidth: m ? '100%' : 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 12 : 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => { setSelectedFile(null); setFileContent(''); setIsEditing(false); setSaveStatus('idle') }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.7)' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: m ? 15 : 17, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                {selectedFile.name}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{formatSize(selectedFile.size)}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>·</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Updated {timeAgo(selectedFile.lastModified)}</span>
                {saveStatus === 'success' && <span style={{ fontSize: 11, color: '#32D74B', fontWeight: 600 }}>✓ Saved</span>}
                {saveStatus === 'error' && <span style={{ fontSize: 11, color: '#FF453A', fontWeight: 600 }}>✗ Save failed</span>}
              </div>
            </div>
            {/* Edit/View toggle + Save */}
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={() => { setIsEditing(false); setEditContent(fileContent) }}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || editContent === fileContent}
                      style={{ 
                        background: editContent !== fileContent ? '#007AFF' : 'rgba(0,122,255,0.3)',
                        border: 'none', borderRadius: 8, padding: '8px 14px', 
                        cursor: saving || editContent === fileContent ? 'not-allowed' : 'pointer', 
                        display: 'flex', alignItems: 'center', gap: 6, 
                        color: '#fff', fontSize: 12, fontWeight: 600,
                        opacity: saving ? 0.5 : 1 
                      }}
                    >
                      <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="macos-panel" style={{ padding: m ? 16 : 24, minHeight: 400 }}>
            {contentLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                style={{
                  width: '100%', minHeight: 500, background: 'rgba(0,0,0,0.2)', 
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                  padding: 16, fontSize: 13, lineHeight: 1.7, 
                  color: 'rgba(255,255,255,0.85)', fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                  resize: 'vertical', outline: 'none',
                }}
                spellCheck={false}
              />
            ) : selectedFile.name.endsWith('.json') ? (
              <pre style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'SF Mono', Monaco, monospace" }}>
                {fileContent}
              </pre>
            ) : (
              <div
                style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.82)', wordBreak: 'break-word' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
              />
            )}
          </div>
        </div>
      </PageTransition>
    )
  }

  // File list view
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={m ? 18 : 22} style={{ color: '#BF5AF2' }} /> Memory Explorer
            <HelpTooltip content="Click any .md file to edit it inline. SOUL.md controls personality, HEARTBEAT.md controls checking behavior." />
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Your agent's memory files — personality, context & daily logs</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: m ? 8 : 20 }}>
          {[
            { label: 'Files', value: docs.length, icon: FileText, color: '#007AFF' },
            { label: 'Daily Logs', value: dailyFiles.length, icon: Calendar, color: '#BF5AF2' },
            { label: 'Total Size', value: Math.round(totalSize / 1024) || 0, suffix: ' KB', icon: HardDrive, color: '#32D74B' },
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

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Search memory files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="macos-input"
            style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 10, paddingBottom: 10, fontSize: 13 }}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Core Files */}
            {filteredCore.length > 0 && (
              <FileSection title="Core Files" subtitle="Agent personality, identity & config" files={filteredCore} onOpen={openFile} isMobile={m} />
            )}

            {/* Daily Memory */}
            {filteredDaily.length > 0 && (
              <FileSection title="Daily Memory" subtitle="Session logs & daily notes" files={filteredDaily} onOpen={openFile} isMobile={m} />
            )}

            {/* State Files */}
            {filteredState.length > 0 && (
              <FileSection title="State & Config" subtitle="Heartbeat state, tasks, misc" files={filteredState} onOpen={openFile} isMobile={m} />
            )}

            {docs.length === 0 && (
              <div className="macos-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
                <Brain size={36} style={{ color: 'rgba(255,255,255,0.15)', margin: '0 auto 12px', display: 'block' }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>No memory files found</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Your agent's memory files will appear here once created.</p>
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  )
}

function FileSection({ title, subtitle, files, onOpen, isMobile }: { title: string; subtitle: string; files: MemoryFile[]; onOpen: (f: MemoryFile) => void; isMobile: boolean }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{title}</h3>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{subtitle}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? 8 : 12 }}>
        {files.map((file, i) => {
          const { icon: Icon, color } = getFileIcon(file.name)
          return (
            <motion.div
              key={file.path}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i }}
              className="macos-panel"
              style={{ padding: isMobile ? 14 : 16, cursor: 'pointer' }}
              onClick={() => onOpen(file)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: isMobile ? 36 : 40, height: isMobile ? 36 : 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={isMobile ? 16 : 18} style={{ color }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{formatSize(file.size)}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>·</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{timeAgo(file.lastModified)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
