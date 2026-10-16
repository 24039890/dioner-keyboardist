/**
 * DIONER design tokens — strict white-and-blue identity (light theme only).
 * Status (success / warning / error) is expressed with icons and wording,
 * never with extra hues. See docs/DESIGN_SYSTEM.md.
 */
export const colors = {
  white: '#FFFFFF',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  light: '#EFF6FF',
  pale: '#DBEAFE',
  text: '#172554',
  textSecondary: '#475569',
  border: '#DBEAFE',
  /** Neutral near-white used sparingly for contrast panels. */
  surface: '#F8FAFC',
  /** Modal scrim: primary text colour at 28 % opacity. */
  scrim: 'rgba(23, 37, 84, 0.28)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const touch = {
  /** Minimum touch target (dp). */
  min: 48,
} as const;

export const typography = {
  display: { fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -1.5 },
  title: { fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 },
  subheading: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  chord: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
} as const;

export const shadow = {
  card: {
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
} as const;
