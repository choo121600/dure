/**
 * Unit tests for CLI theme utilities
 */
import { describe, it, expect } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME,
  getTheme,
  getThemeOrDefault,
  getAvailableThemes,
  isValidTheme,
  getThemeColors,
  type ThemeName,
} from '../../../src/cli/utils/themes.js';

describe('Theme Utilities', () => {
  describe('THEMES constant', () => {
    it('should have dark theme', () => {
      expect(THEMES.dark).toBeDefined();
      expect(THEMES.dark.name).toBe('VS Code Dark+');
      expect(THEMES.dark.colors.backgroundColor).toBe('#1e1e1e');
    });

    it('should have light theme', () => {
      expect(THEMES.light).toBeDefined();
      expect(THEMES.light.name).toBe('VS Code Light+');
      expect(THEMES.light.colors.backgroundColor).toBe('#ffffff');
    });

    it('should have dracula theme', () => {
      expect(THEMES.dracula).toBeDefined();
      expect(THEMES.dracula.name).toBe('Dracula');
      expect(THEMES.dracula.colors.backgroundColor).toBe('#282a36');
    });

    it('should have github-dark theme', () => {
      expect(THEMES['github-dark']).toBeDefined();
      expect(THEMES['github-dark'].name).toBe('GitHub Dark');
      expect(THEMES['github-dark'].colors.backgroundColor).toBe('#0d1117');
    });

    it('should have one-dark theme', () => {
      expect(THEMES['one-dark']).toBeDefined();
      expect(THEMES['one-dark'].name).toBe('One Dark Pro');
      expect(THEMES['one-dark'].colors.backgroundColor).toBe('#282c34');
    });

    it('should have monokai theme', () => {
      expect(THEMES.monokai).toBeDefined();
      expect(THEMES.monokai.name).toBe('Monokai');
      expect(THEMES.monokai.colors.backgroundColor).toBe('#272822');
    });

    it('should have all required color properties for each theme', () => {
      const requiredColors = [
        'foregroundColor',
        'backgroundColor',
        'black',
        'red',
        'green',
        'yellow',
        'blue',
        'magenta',
        'cyan',
        'white',
        'brightBlack',
        'brightRed',
        'brightGreen',
        'brightYellow',
        'brightBlue',
        'brightMagenta',
        'brightCyan',
        'brightWhite',
      ];

      for (const themeName of Object.keys(THEMES) as ThemeName[]) {
        const theme = THEMES[themeName];
        for (const colorName of requiredColors) {
          expect(
            theme.colors[colorName as keyof typeof theme.colors],
            `${themeName} should have ${colorName}`
          ).toBeDefined();
        }
      }
    });
  });

  describe('DEFAULT_THEME', () => {
    it('should be dark', () => {
      expect(DEFAULT_THEME).toBe('dark');
    });

    it('should be a valid theme', () => {
      expect(isValidTheme(DEFAULT_THEME)).toBe(true);
    });
  });

  describe('getTheme', () => {
    it('should return theme for valid name', () => {
      const theme = getTheme('dark');
      expect(theme).not.toBeNull();
      expect(theme!.name).toBe('VS Code Dark+');
    });

    it('should return theme for dracula', () => {
      const theme = getTheme('dracula');
      expect(theme).not.toBeNull();
      expect(theme!.name).toBe('Dracula');
    });

    it('should be case-insensitive', () => {
      const theme1 = getTheme('DARK');
      const theme2 = getTheme('Dark');
      const theme3 = getTheme('dark');

      expect(theme1).not.toBeNull();
      expect(theme2).not.toBeNull();
      expect(theme3).not.toBeNull();
      expect(theme1!.name).toBe(theme2!.name);
      expect(theme2!.name).toBe(theme3!.name);
    });

    it('should return null for unknown theme', () => {
      const theme = getTheme('nonexistent');
      expect(theme).toBeNull();
    });
  });

  describe('getThemeOrDefault', () => {
    it('should return theme for valid name', () => {
      const theme = getThemeOrDefault('dracula');
      expect(theme.name).toBe('Dracula');
    });

    it('should return default theme for unknown name', () => {
      const theme = getThemeOrDefault('nonexistent');
      expect(theme.name).toBe(THEMES[DEFAULT_THEME].name);
    });

    it('should never return null', () => {
      const theme = getThemeOrDefault('');
      expect(theme).not.toBeNull();
      expect(theme.colors).toBeDefined();
    });
  });

  describe('getAvailableThemes', () => {
    it('should return all theme names', () => {
      const themes = getAvailableThemes();
      expect(themes).toContain('dark');
      expect(themes).toContain('light');
      expect(themes).toContain('dracula');
      expect(themes).toContain('github-dark');
      expect(themes).toContain('one-dark');
      expect(themes).toContain('monokai');
    });

    it('should return at least 6 themes', () => {
      const themes = getAvailableThemes();
      expect(themes.length).toBeGreaterThanOrEqual(6);
    });

    it('should return array of strings', () => {
      const themes = getAvailableThemes();
      themes.forEach((theme) => {
        expect(typeof theme).toBe('string');
      });
    });
  });

  describe('isValidTheme', () => {
    it('should return true for valid themes', () => {
      expect(isValidTheme('dark')).toBe(true);
      expect(isValidTheme('light')).toBe(true);
      expect(isValidTheme('dracula')).toBe(true);
      expect(isValidTheme('github-dark')).toBe(true);
    });

    it('should return false for invalid themes', () => {
      expect(isValidTheme('nonexistent')).toBe(false);
      expect(isValidTheme('')).toBe(false);
      expect(isValidTheme('INVALID')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidTheme('DARK')).toBe(true);
      expect(isValidTheme('Dracula')).toBe(true);
    });
  });

  describe('getThemeColors', () => {
    it('should return colors for valid theme', () => {
      const colors = getThemeColors('dracula');
      expect(colors.backgroundColor).toBe('#282a36');
      expect(colors.foregroundColor).toBe('#f8f8f2');
    });

    it('should return default theme colors for invalid theme', () => {
      const colors = getThemeColors('nonexistent');
      expect(colors.backgroundColor).toBe(THEMES[DEFAULT_THEME].colors.backgroundColor);
    });

    it('should include all color properties', () => {
      const colors = getThemeColors('dark');
      expect(colors.black).toBeDefined();
      expect(colors.red).toBeDefined();
      expect(colors.green).toBeDefined();
      expect(colors.yellow).toBeDefined();
      expect(colors.blue).toBeDefined();
      expect(colors.magenta).toBeDefined();
      expect(colors.cyan).toBeDefined();
      expect(colors.white).toBeDefined();
    });
  });

  describe('Theme color values', () => {
    it('should have valid hex color formats', () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

      for (const themeName of Object.keys(THEMES) as ThemeName[]) {
        const theme = THEMES[themeName];
        for (const [key, value] of Object.entries(theme.colors)) {
          expect(
            hexColorRegex.test(value),
            `${themeName}.${key} should be valid hex color, got: ${value}`
          ).toBe(true);
        }
      }
    });
  });
});
