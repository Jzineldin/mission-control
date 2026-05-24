import { queryOptions, useQuery } from '@tanstack/react-query'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const requestUrl =
    typeof window === 'undefined' ? url : new URL(url, window.location.origin).toString()
  const res = await fetch(requestUrl, init)
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!contentType.includes('application/json')) {
    const preview = (await res.text()).slice(0, 90).replace(/\s+/g, ' ')
    throw new Error(`API returned non-JSON payload (${contentType || 'unknown'}): ${preview}`)
  }
  return res.json()
}

export function apiQueryOptions<T>(url: string, interval?: number) {
  return queryOptions<T, Error>({
    queryKey: ['api', url],
    queryFn: () => fetchJson<T>(url),
    refetchInterval: interval && interval > 0 ? interval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })
}

export function useApi<T>(url: string, interval?: number) {
  const query = useQuery(apiQueryOptions<T>(url, interval))
  const error = query.error ? String(query.error.message || 'Unknown error') : null

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: error?.includes('expected pattern')
      ? 'Invalid API URL/pattern. Endpoint format bozuk veya eski olabilir.'
      : error,
    refetch: () => query.refetch(),
  }
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
