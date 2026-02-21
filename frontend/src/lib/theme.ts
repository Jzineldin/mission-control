/**
 * Shared design tokens for the Mission Control glassmorphism UI.
 * Import these instead of repeating rgba/hex values inline.
 */

// ── Text colours ──────────────────────────────────────────────────────────────
export const TEXT = {
  primary:   'rgba(255,255,255,0.92)',
  secondary: 'rgba(255,255,255,0.65)',
  tertiary:  'rgba(255,255,255,0.45)',
  dim:       'rgba(255,255,255,0.35)',
  muted:     'rgba(255,255,255,0.25)',
} as const

// ── Accent colours ────────────────────────────────────────────────────────────
export const COLORS = {
  blue:   '#007AFF',
  purple: '#BF5AF2',
  green:  '#32D74B',
  orange: '#FF9500',
  red:    '#FF453A',
  yellow: '#FFD60A',
  teal:   '#5AC8FA',
  gray:   '#8E8E93',
} as const

// ── Accent helpers — bg + border at standard opacities ────────────────────────
export const accent = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    bg:       `rgba(${r},${g},${b},0.10)`,
    bgHover:  `rgba(${r},${g},${b},0.20)`,
    border:   `rgba(${r},${g},${b},0.30)`,
    borderHi: `rgba(${r},${g},${b},0.50)`,
  } as const
}

// ── Glass / surface colours ───────────────────────────────────────────────────
export const GLASS = {
  border:       'rgba(255,255,255,0.08)',
  borderSubtle: 'rgba(255,255,255,0.05)',
  divider:      'rgba(255,255,255,0.06)',
  surface:      'rgba(255,255,255,0.04)',
} as const

// ── Spacing scale ─────────────────────────────────────────────────────────────
export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  '3xl': 32,
} as const

// ── Typography ────────────────────────────────────────────────────────────────
export const FONT = {
  label:   { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: TEXT.tertiary },
  body:    { fontSize: 12, color: TEXT.secondary },
  caption: { fontSize: 11, color: TEXT.tertiary },
  title:   { fontSize: 14, fontWeight: 600, color: TEXT.primary },
} as const

// ── Radii ─────────────────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
} as const
