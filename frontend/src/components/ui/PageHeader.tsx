import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

interface PageHeaderProps {
  icon: ReactNode
  title: string
  subtitle: string
}

/**
 * Page-level header: icon + h1 (text-title) + subtitle (text-body).
 * Every page hand-rolls this same layout; this component standardises it.
 */
export default function PageHeader({ icon, title, subtitle }: PageHeaderProps) {
  return (
    <div>
      <h1 className={`text-title ${styles.header}`}>
        {icon}
        {title}
      </h1>
      <p className={`text-body ${styles.subtitle}`}>{subtitle}</p>
    </div>
  )
}
