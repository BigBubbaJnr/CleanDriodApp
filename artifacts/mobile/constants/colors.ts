// Retro Tech / Y2K CRT palette
const colors = {
  light: {
    text: '#0A0A0A',
    tint: '#007A70',
    background: '#C8C8C8',
    foreground: '#0A0A0A',
    card: '#B8B8B8',
    cardForeground: '#0A0A0A',
    primary: '#007A70',
    primaryForeground: '#FFFFFF',
    secondary: '#A0A0A0',
    secondaryForeground: '#0A0A0A',
    muted: '#D0D0D0',
    mutedForeground: '#505050',
    accent: '#CC4400',
    accentForeground: '#FFFFFF',
    destructive: '#CC0000',
    destructiveForeground: '#FFFFFF',
    border: '#909090',
    input: '#B0B0B0',
    warning: '#BB8800',
    success: '#227700',
    bevelLight: '#E0E0E0',
    bevelDark: '#707070',
  },
  dark: {
    text: '#D0D0D0',
    tint: '#00E5CC',
    background: '#080808',      // near-black CRT
    foreground: '#CCCCCC',      // phosphor white
    card: '#0E0E0E',            // dark panel
    cardForeground: '#CCCCCC',
    primary: '#00E5CC',         // neon teal — the cursor color
    primaryForeground: '#080808',
    secondary: '#1A1A1A',
    secondaryForeground: '#CCCCCC',
    muted: '#0B0B0B',
    mutedForeground: '#444444',
    accent: '#FF5500',          // hot orange
    accentForeground: '#FFFFFF',
    destructive: '#FF1744',
    destructiveForeground: '#FFFFFF',
    border: '#1C1C1C',
    input: '#141414',
    warning: '#FFB800',
    success: '#39FF14',         // neon green
    bevelLight: '#2A2A2A',      // top/left raised edge
    bevelDark: '#020202',       // bottom/right shadow edge
  },
  radius: 2, // Almost no rounding — sharp retro corners
};

export default colors;
