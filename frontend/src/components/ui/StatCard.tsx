import type { CSSProperties, ReactNode } from 'react'
import GlassCard from '../GlassCard'
import { useIsMobile } from '../../lib/useIsMobile'
import styles from './StatCard.module.css'

interface StatCardProps {
  label: string
  value: ReactNode
  /** Icon component (e.g. a Lucide icon element) */
  icon?: ReactNode
  /** Accent colour used for the icon background tint. Defaults to rgba(255,255,255,0.5). */
  color?: string
  /** Optional suffix rendered in a smaller, dimmer span after the value */
  suffix?: string
  delay?: number
}

/**
 * Small KPI card: GlassCard wrapper, uppercase label, large tabular-nums value.
 * Matches the stat row shape used in Cron, Scout, and Docs pages.
 */
export default function StatCard({ label, value, icon, color = 'rgba(255,255,255,0.5)', suffix, delay = 0 }: StatCardProps) {
  const m = useIsMobile()

  return (
    <GlassCard delay={delay} noPad>
      <div
        className={m ? `${styles.inner} ${styles.innerMobile}` : styles.inner}
      >
        <div className={m ? `${styles.top} ${styles.topMobile}` : styles.top}>
          {icon && (
            <div
              className={m ? `${styles.iconWrap} ${styles.iconWrapMobile}` : styles.iconWrap}
              style={{ '--stat-color': color } as CSSProperties}
            >
              {icon}
            </div>
          )}
          <span className={m ? `${styles.label} ${styles.labelMobile}` : styles.label}>
            {label}
          </span>
        </div>
        <p className={m ? `${styles.value} ${styles.valueMobile}` : styles.value}>
          {value}
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </p>
      </div>
    </GlassCard>
  )
}
