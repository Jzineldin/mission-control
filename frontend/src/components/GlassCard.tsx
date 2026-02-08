import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useIsMobile } from '../lib/useIsMobile'

interface Props {
  children: ReactNode
  className?: string
  hover?: boolean
  delay?: number
  noPad?: boolean
  style?: React.CSSProperties
}

export default function GlassCard({ children, className = '', hover = true, delay = 0, noPad = false, style }: Props) {
  const isMobile = useIsMobile()
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      whileHover={hover && !isMobile ? {
        y: -2,
        transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
      } : undefined}
      className={`macos-panel ${className}`}
      style={{ overflow: 'hidden', ...style }}
    >
      <div style={noPad ? undefined : { padding: isMobile ? 16 : 24 }}>
        {children}
      </div>
    </motion.div>
  )
}
