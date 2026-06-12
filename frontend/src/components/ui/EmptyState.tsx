import type { CSSProperties, ReactNode } from 'react'
import { useIsMobile } from '../../lib/useIsMobile'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  /** Accent colour for the icon circle background tint. Defaults to #BF5AF2. */
  color?: string
  /** Optional action element rendered below the description */
  action?: ReactNode
}

/**
 * Centered empty-state: icon-in-circle, title, description, optional action.
 * Matches the "No results yet" block used in Scout.tsx and similar pages.
 */
export default function EmptyState({ icon, title, description, color = '#BF5AF2', action }: EmptyStateProps) {
  const m = useIsMobile()

  return (
    <div
      className={`macos-panel ${styles.wrap}${m ? ` ${styles.wrapMobile}` : ''}`}
    >
      <div
        className={styles.iconCircle}
        style={{ '--empty-color': color } as CSSProperties}
      >
        {icon}
      </div>
      <div>
        <h3 className={m ? `${styles.title} ${styles.titleMobile}` : styles.title}>
          {title}
        </h3>
        <p className={m ? `${styles.desc} ${styles.descMobile}` : styles.desc}>
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}
