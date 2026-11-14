/**
 * SafarSaathi Official Design System Colors
 * Dark-themed visual identity
 */

export const Palette = {
  mainBackground: '#06080F',
  secondaryBackground: '#0B0F19',
  cardBackground: '#161B2F',
  insetSurfaces: '#0C101B',
  borders: '#2D3450',
  primaryViolet: '#635BFF',
  softLavender: '#A7B4FF',
  sosRed: '#F13C5C',
  deepSosRed: '#B90E3C',
  successGreen: '#00B887',
  warningAmber: '#E89B15',
  primaryText: '#F3F5FA',
  secondaryText: '#A2AABD',
  mutedText: '#69758C',
} as const;

const Colors = {
  // Brand tokens
  primary: Palette.primaryViolet,
  primaryLight: Palette.softLavender,
  primaryDark: '#4A41E0',
  
  // Status tokens
  safe: Palette.successGreen,
  safeLight: 'rgba(0, 184, 135, 0.15)',
  warning: Palette.warningAmber,
  warningLight: 'rgba(232, 155, 21, 0.15)',
  danger: Palette.sosRed,
  dangerDark: Palette.deepSosRed,
  dangerLight: 'rgba(241, 60, 92, 0.15)',
  
  // Surface and structure tokens
  background: Palette.mainBackground,
  backgroundSecondary: Palette.secondaryBackground,
  card: Palette.cardBackground,
  surface: Palette.cardBackground,
  inset: Palette.insetSurfaces,
  border: Palette.borders,
  
  // Typography
  textPrimary: Palette.primaryText,
  textSecondary: Palette.secondaryText,
  textMuted: Palette.mutedText,
  textInverse: Palette.primaryText,
  
  // Overlay
  overlay: 'rgba(6, 8, 15, 0.75)',
  
  // Theme variants (Dark is default in SafarSaathi)
  dark: {
    text: Palette.primaryText,
    textSecondary: Palette.secondaryText,
    textMuted: Palette.mutedText,
    background: Palette.mainBackground,
    surface: Palette.cardBackground,
    card: Palette.cardBackground,
    inset: Palette.insetSurfaces,
    border: Palette.borders,
    tint: Palette.primaryViolet,
    tabIconDefault: Palette.mutedText,
    tabIconSelected: Palette.primaryViolet,
  },
  light: {
    // Retained for subtle contrast or alternate viewing options if requested
    text: Palette.primaryText,
    textSecondary: Palette.secondaryText,
    textMuted: Palette.mutedText,
    background: Palette.mainBackground,
    surface: Palette.cardBackground,
    card: Palette.cardBackground,
    inset: Palette.insetSurfaces,
    border: Palette.borders,
    tint: Palette.primaryViolet,
    tabIconDefault: Palette.mutedText,
    tabIconSelected: Palette.primaryViolet,
  },
};

export default Colors;
