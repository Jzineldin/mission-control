import { useState, useEffect } from 'react'

export function useApi<T>(url: string, interval?: number) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as T
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    if (interval) {
      const timer = setInterval(fetchData, interval)
      return () => clearInterval(timer)
    }
  }, [url, interval])

  return { data, loading, error, refetch: fetchData }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export function useDashboardData() {
  const [statusData, setStatusData] = useState<AnyRecord | null>(null)
  const [activityData, setActivityData] = useState<AnyRecord | null>(null)
  const [sessionsData, setSessionsData] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    const [statusRes, activityRes, sessionsRes] = await Promise.allSettled([
      fetch('/api/status').then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<AnyRecord> }),
      fetch('/api/activity').then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<AnyRecord> }),
      fetch('/api/sessions').then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<AnyRecord> }),
    ])
    if (statusRes.status === 'fulfilled')   setStatusData(statusRes.value)
    if (activityRes.status === 'fulfilled') setActivityData(activityRes.value)
    if (sessionsRes.status === 'fulfilled') setSessionsData(sessionsRes.value)
    setLoading(false)
  }

  useEffect(() => {
    const run = async () => { await fetchAll() }
    run()
    const timer = setInterval(() => { void fetchAll() }, 10000)
    return () => clearInterval(timer)
  }, [])

  return { status: statusData, activity: activityData, sessions: sessionsData, loading }
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) {
    // Future date
    const absDiff = -diff
    const mins = Math.floor(absDiff / 60000)
    if (mins < 1) return 'in <1m'
    if (mins < 60) return `in ${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `in ${hrs}h`
    const days = Math.floor(hrs / 24)
    return `in ${days}d`
  }
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
