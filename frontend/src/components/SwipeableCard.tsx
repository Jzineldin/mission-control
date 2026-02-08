import { useRef, useCallback } from 'react'

interface SwipeableCardProps {
  children: React.ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  leftLabel?: string
  rightLabel?: string
  leftColor?: string
  rightColor?: string
  disabled?: boolean
  threshold?: number
}

export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Deploy',
  rightLabel = 'Dismiss',
  leftColor = '#32D74B',
  rightColor = '#FF453A',
  disabled = false,
  threshold = 80,
}: SwipeableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const currentX = useRef(0)
  const locked = useRef<'x' | 'y' | null>(null)
  const fired = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    const touch = e.touches[0]
    startX.current = touch.clientX
    startY.current = touch.clientY
    currentX.current = 0
    locked.current = null
    fired.current = false

    const card = cardRef.current
    if (card) {
      card.style.transition = 'none'
      card.style.willChange = 'transform'
    }
  }, [disabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || fired.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - startX.current
    const dy = touch.clientY - startY.current

    // Lock direction on first significant movement
    if (!locked.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        locked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      return
    }

    // If vertical scroll, bail out
    if (locked.current === 'y') return

    // Horizontal swipe — apply rubber band effect
    const resistance = 0.55
    const dampened = dx > 0
      ? Math.pow(dx, resistance)
      : -Math.pow(Math.abs(dx), resistance)

    currentX.current = dx

    const card = cardRef.current
    if (card) {
      card.style.transform = `translate3d(${dampened}px, 0, 0)`
    }

    // Update action backgrounds
    const progress = Math.min(Math.abs(dx) / threshold, 1)
    if (leftRef.current) {
      leftRef.current.style.opacity = dx > 0 ? String(progress) : '0'
    }
    if (rightRef.current) {
      rightRef.current.style.opacity = dx < 0 ? String(progress) : '0'
    }
  }, [disabled, threshold])

  const handleTouchEnd = useCallback(() => {
    if (disabled || locked.current !== 'x' || fired.current) {
      // Reset if no horizontal swipe
      const card = cardRef.current
      if (card) {
        card.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
        card.style.transform = 'translate3d(0, 0, 0)'
        card.style.willChange = ''
      }
      if (leftRef.current) leftRef.current.style.opacity = '0'
      if (rightRef.current) rightRef.current.style.opacity = '0'
      return
    }

    const dx = currentX.current
    const card = cardRef.current

    if (dx > threshold && onSwipeRight) {
      // Swipe right — Deploy
      fired.current = true
      if (card) {
        card.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)'
        card.style.transform = 'translate3d(100vw, 0, 0)'
      }
      setTimeout(() => {
        onSwipeRight()
        // Reset after callback
        if (card) {
          card.style.transition = 'none'
          card.style.transform = 'translate3d(0, 0, 0)'
          card.style.willChange = ''
        }
        if (leftRef.current) leftRef.current.style.opacity = '0'
      }, 300)
    } else if (dx < -threshold && onSwipeLeft) {
      // Swipe left — Dismiss
      fired.current = true
      if (card) {
        card.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)'
        card.style.transform = 'translate3d(-100vw, 0, 0)'
      }
      setTimeout(() => {
        onSwipeLeft()
        if (card) {
          card.style.transition = 'none'
          card.style.transform = 'translate3d(0, 0, 0)'
          card.style.willChange = ''
        }
        if (rightRef.current) rightRef.current.style.opacity = '0'
      }, 300)
    } else {
      // Snap back with spring-like easing
      if (card) {
        card.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        card.style.transform = 'translate3d(0, 0, 0)'
        card.style.willChange = ''
      }
      if (leftRef.current) {
        leftRef.current.style.transition = 'opacity 0.3s ease'
        leftRef.current.style.opacity = '0'
        setTimeout(() => { if (leftRef.current) leftRef.current.style.transition = '' }, 300)
      }
      if (rightRef.current) {
        rightRef.current.style.transition = 'opacity 0.3s ease'
        rightRef.current.style.opacity = '0'
        setTimeout(() => { if (rightRef.current) rightRef.current.style.transition = '' }, 300)
      }
    }
  }, [disabled, threshold, onSwipeLeft, onSwipeRight])

  if (disabled) return <>{children}</>

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16 }}>
      {/* Deploy action (swipe right) */}
      <div
        ref={leftRef}
        style={{
          position: 'absolute', inset: 0,
          background: leftColor,
          display: 'flex', alignItems: 'center', paddingLeft: 24, gap: 10,
          opacity: 0,
        }}
      >
        <span style={{ fontSize: 18 }}>🚀</span>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{leftLabel}</span>
      </div>

      {/* Dismiss action (swipe left) */}
      <div
        ref={rightRef}
        style={{
          position: 'absolute', inset: 0,
          background: rightColor,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 24, gap: 10,
          opacity: 0,
        }}
      >
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{rightLabel}</span>
        <span style={{ fontSize: 18 }}>✕</span>
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ position: 'relative', zIndex: 2 }}
      >
        {children}
      </div>
    </div>
  )
}
