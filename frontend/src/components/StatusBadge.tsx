interface Props {
  status: 'active' | 'idle' | 'paused' | 'failed' | 'ok' | 'error' | 'off' | string
  size?: 'sm' | 'md'
  pulse?: boolean
  label?: string
}

const statusConfig: Record<string, { badge: string; dotClass: string }> = {
  active: {
    badge: 'macos-badge-green',
    dotClass: 'status-dot-green'
  },
  ok: {
    badge: 'macos-badge-green',
    dotClass: 'status-dot-green'
  },
  idle: {
    badge: 'macos-badge-blue',
    dotClass: 'bg-[#007AFF]'
  },
  paused: {
    badge: 'macos-badge-orange',
    dotClass: 'status-dot-orange'
  },
  failed: {
    badge: 'macos-badge-red',
    dotClass: 'status-dot-red'
  },
  error: {
    badge: 'macos-badge-red',
    dotClass: 'status-dot-red'
  },
  off: {
    badge: 'macos-badge',
    dotClass: 'bg-[#8E8E93]'
  },
}

export default function StatusBadge({ status, size = 'sm', pulse = false, label }: Props) {
  const config = statusConfig[status.toLowerCase()] || statusConfig.off
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <span className={`macos-badge ${config.badge}`}>
      <span className={`status-dot ${dotSize} ${config.dotClass} ${pulse ? 'animate-subtle-pulse' : ''}`} />
      <span className="capitalize">{label || status}</span>
    </span>
  )
}