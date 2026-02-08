import { motion } from 'framer-motion'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: number
  className?: string
}

const Skeleton = ({ width = '100%', height = 20, borderRadius = 6, className }: SkeletonProps) => {
  return (
    <motion.div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
        backgroundSize: '200% 100%',
      }}
      animate={{
        backgroundPosition: ['200% 0%', '-200% 0%']
      }}
      transition={{
        duration: 1.5,
        ease: 'linear',
        repeat: Infinity
      }}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  spacing?: number
}

export const SkeletonText = ({ lines = 3, spacing = 8 }: SkeletonTextProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          width={i === lines - 1 ? `${60 + Math.random() * 30}%` : '100%'} 
          height={14} 
        />
      ))}
    </div>
  )
}

interface SkeletonCardProps {
  count?: number
}

export const SkeletonCard = ({ count = 1 }: SkeletonCardProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ 
          padding: 16, borderRadius: 12, 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid rgba(255,255,255,0.06)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Skeleton width={32} height={32} borderRadius={8} />
            <div style={{ flex: 1 }}>
              <Skeleton width="60%" height={16} />
              <div style={{ marginTop: 6 }}>
                <Skeleton width="40%" height={12} />
              </div>
            </div>
          </div>
          <SkeletonText lines={2} spacing={4} />
        </div>
      ))}
    </div>
  )
}

export default Skeleton