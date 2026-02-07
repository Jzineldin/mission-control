import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  hover?: boolean
  delay?: number
  noPad?: boolean
}

export default function GlassCard({ children, className = '', hover = true, delay = 0, noPad = false }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      whileHover={hover ? {
        y: -2,
        transition: {
          duration: 0.15,
          ease: [0.4, 0, 0.2, 1]
        }
      } : undefined}
      className={`macos-panel ${className}`}
    >
      <div style={noPad ? undefined : { padding: 24 }}>
        {children}
      </div>
    </motion.div>
  )
}
