/**
 * Theme definitions for CLI screenshot generation
 *
 * Provides multiple color themes for ANSI to SVG conversion.
 * Themes are separated into their own module for maintainability and extensibility.
 */

/**
 * Color palette for terminal rendering
 */
export interface ThemeColors {
  foregroundColor: string;
  backgroundColor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/**
 * Theme metadata and colors
 */
export interface Theme {
  name: string;
  description: string;
  colors: ThemeColors;
}

/**
 * Available theme names
 */
export type ThemeName = keyof typeof THEMES;

/**
 * Built-in themes
 */
export const THEMES = {
  /**
   * VS Code Dark+ inspired theme (default)
   */
  dark: {
    name: 'VS Code Dark+',
    description: 'Dark theme inspired by VS Code Dark+',
    colors: {
      foregroundColor: '#d4d4d4',
      backgroundColor: '#1e1e1e',
      black: '#1e1e1e',
      red: '#f44747',
      green: '#6a9955',
      yellow: '#dcdcaa',
      blue: '#569cd6',
      magenta: '#c586c0',
      cyan: '#4ec9b0',
      white: '#d4d4d4',
      brightBlack: '#808080',
      brightRed: '#f44747',
      brightGreen: '#6a9955',
      brightYellow: '#dcdcaa',
      brightBlue: '#569cd6',
      brightMagenta: '#c586c0',
      brightCyan: '#4ec9b0',
      brightWhite: '#ffffff',
    },
  },

  /**
   * VS Code Light+ inspired theme
   */
  light: {
    name: 'VS Code Light+',
    description: 'Light theme inspired by VS Code Light+',
    colors: {
      foregroundColor: '#333333',
      backgroundColor: '#ffffff',
      black: '#333333',
      red: '#cd3131',
      green: '#008000',
      yellow: '#795e26',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#d4d4d4',
      brightBlack: '#666666',
      brightRed: '#cd3131',
      brightGreen: '#008000',
      brightYellow: '#795e26',
      brightBlue: '#0451a5',
      brightMagenta: '#bc05bc',
      brightCyan: '#0598bc',
      brightWhite: '#333333',
    },
  },

  /**
   * Dracula theme
   * https://draculatheme.com/
   */
  dracula: {
    name: 'Dracula',
    description: 'Popular dark theme with vibrant colors',
    colors: {
      foregroundColor: '#f8f8f2',
      backgroundColor: '#282a36',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },

  /**
   * GitHub Dark theme
   * https://github.com/primer/github-syntax-dark
   */
  'github-dark': {
    name: 'GitHub Dark',
    description: 'GitHub dark mode color scheme',
    colors: {
      foregroundColor: '#c9d1d9',
      backgroundColor: '#0d1117',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc',
    },
  },

  /**
   * One Dark Pro theme (Atom inspired)
   */
  'one-dark': {
    name: 'One Dark Pro',
    description: 'Atom One Dark inspired theme',
    colors: {
      foregroundColor: '#abb2bf',
      backgroundColor: '#282c34',
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  },

  /**
   * Monokai theme
   */
  monokai: {
    name: 'Monokai',
    description: 'Classic Monokai color scheme',
    colors: {
      foregroundColor: '#f8f8f2',
      backgroundColor: '#272822',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
  },
} as const;

/**
 * Default theme name
 */
export const DEFAULT_THEME: ThemeName = 'dark';

/**
 * Get a theme by name
 *
 * @param name - Theme name (case-insensitive)
 * @returns Theme definition or null if not found
 */
export function getTheme(name: string): Theme | null {
  const normalizedName = name.toLowerCase() as ThemeName;
  const theme = THEMES[normalizedName];
  return theme || null;
}

/**
 * Get a theme by name, falling back to default if not found
 *
 * @param name - Theme name (case-insensitive)
 * @returns Theme definition (never null)
 */
export function getThemeOrDefault(name: string): Theme {
  return getTheme(name) || THEMES[DEFAULT_THEME];
}

/**
 * Get list of available theme names
 */
export function getAvailableThemes(): ThemeName[] {
  return Object.keys(THEMES) as ThemeName[];
}

/**
 * Check if a theme name is valid
 */
export function isValidTheme(name: string): name is ThemeName {
  return name.toLowerCase() in THEMES;
}

/**
 * Get theme colors in the format expected by ansi-to-svg
 *
 * @param themeName - Theme name
 * @returns Color object for ansi-to-svg
 */
export function getThemeColors(themeName: string): ThemeColors {
  const theme = getThemeOrDefault(themeName);
  return theme.colors;
}
