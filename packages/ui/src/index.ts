/**
 * Kolab design tokens, ported from the makeUGCads reference (dark gray-950 base,
 * violet/indigo primary, pink accent, Outfit). `theme.css` holds the same values for the web.
 */
export const colors = {
  dark: {
    background: '#030712', // gray-950
    foreground: '#f9fafb',
    card: '#0f172a', // reference --color-dark-bg
    cardElevated: '#1e293b', // reference --color-dark-card
    border: 'rgba(255,255,255,0.10)',
    muted: '#9ca3af',
    primary: '#8b5cf6', // violet-500
    primaryHover: '#7c3aed',
    primaryGradient: ['#6366f1', '#4f46e5'] as const, // reference PrimaryButton
    accent: '#ec4899', // pink-500
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  light: {
    background: '#ffffff',
    foreground: '#0b0b12',
    card: '#f8fafc',
    cardElevated: '#f1f5f9',
    border: 'rgba(15,23,42,0.10)',
    muted: '#64748b',
    primary: '#7c3aed',
    primaryHover: '#6d28d9',
    primaryGradient: ['#6366f1', '#4f46e5'] as const,
    accent: '#db2777',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
  },
} as const;

export const fonts = { sans: 'Outfit' } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Slot status → color, shared by the slot grid (web) and slot screens (mobile). */
export const slotStatusColor = {
  open: '#64748b',
  submitted: '#6366f1',
  approved: '#8b5cf6',
  rejected: '#f59e0b',
  released: '#22c55e',
  holdback_released: '#16a34a',
  missed: '#ef4444',
  holdback_forfeited: '#b91c1c',
} as const;
