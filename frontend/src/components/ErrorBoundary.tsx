import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '400px', padding: '32px', textAlign: 'center'
        }}>
          <div style={{ 
            width: 64, height: 64, borderRadius: '50%', 
            background: 'rgba(255,69,58,0.1)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', marginBottom: 16
          }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
          </div>
          <h3 style={{ color: 'rgba(255,255,255,0.92)', marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
            Something went wrong
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 16, fontSize: 14 }}>
            The page crashed. Try refreshing or go back to the Dashboard.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#007AFF', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary