interface Props {
  status: 'active' | 'idle' | 'paused' | 'failed' | 'ok' | 'error' | 'off' | string
  size?: 'sm' | 'md'
  pulse?: boolean
  label?: string
}

const statusConfig: Record<string, { badge: string; dotClass: string; dotColor?: string }> = {
  active: {
    badge: 'macos-badge-green',
    dotClass: 'status-dot status-dot-green',
  },
  ok: {
    badge: 'macos-badge-green',
    dotClass: 'status-dot status-dot-green',
  },
  idle: {
    badge: 'macos-badge-blue',
    dotClass: 'status-dot',
    dotColor: '#007AFF',
  },
  paused: {
    badge: 'macos-badge-orange',
    dotClass: 'status-dot status-dot-orange',
  },
  failed: {
    badge: 'macos-badge-red',
    dotClass: 'status-dot status-dot-red',
  },
  error: {
    badge: 'macos-badge-red',
    dotClass: 'status-dot status-dot-red',
  },
  off: {
    badge: 'macos-badge',
    dotClass: 'status-dot',
    dotColor: '#8E8E93',
  },
}

export default function StatusBadge({ status, size = 'sm', pulse = false, label }: Props) {
  const config = statusConfig[status.toLowerCase()] || statusConfig.off
  const dotPx = size === 'sm' ? 6 : 8

  return (
    <span className={`macos-badge ${config.badge}`}>
      <span
        className={`${config.dotClass} ${pulse ? 'animate-subtle-pulse' : ''}`}
        style={{
          width: dotPx,
          height: dotPx,
          ...(config.dotColor ? { background: config.dotColor, boxShadow: `0 0 4px ${config.dotColor}` } : {}),
        }}
      />
      <span style={{ textTransform: 'capitalize' }}>{label || status}</span>
    </span>
  )
}
