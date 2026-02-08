import { useNavigate } from 'react-router-dom'
import PageTransition from '../components/PageTransition'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ fontSize: 64, fontWeight: 200, color: 'rgba(255,255,255,0.15)' }}>404</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Page not found</h2>
        <button onClick={() => navigate('/')} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Back to Dashboard
        </button>
      </div>
    </PageTransition>
  )
}