/**
 * Type declarations for ansi-to-svg package
 */
declare module 'ansi-to-svg' {
  interface AnsiToSvgColors {
    foregroundColor?: string;
    backgroundColor?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  }

  interface AnsiToSvgOptions {
    /**
     * Padding in pixels from the top
     * @default 0
     */
    paddingTop?: number;

    /**
     * Padding in pixels from the left
     * @default 0
     */
    paddingLeft?: number;

    /**
     * Padding in pixels from the bottom
     * @default 0
     */
    paddingBottom?: number;

    /**
     * Padding in pixels from the right
     * @default 0
     */
    paddingRight?: number;

    /**
     * Font size in pixels
     * @default 14
     */
    fontSize?: number;

    /**
     * Line height in pixels
     * @default 18
     */
    lineHeight?: number;

    /**
     * Font family (use monospace fonts for best results)
     * @default 'SauceCodePro Nerd Font, Source Code Pro, Courier'
     */
    fontFamily?: string;

    /**
     * Color palette for ANSI colors
     */
    colors?: AnsiToSvgColors;
  }

  /**
   * Convert ANSI escaped CLI strings to SVG
   * @param input - ANSI escaped string to convert
   * @param options - Conversion options
   * @returns SVG string
   */
  function ansiToSvg(input: string, options?: AnsiToSvgOptions): string;

  export = ansiToSvg;
}

// Re-export types for external use
export interface AnsiToSvgColors {
  foregroundColor?: string;
  backgroundColor?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface AnsiToSvgOptions {
  paddingTop?: number;
  paddingLeft?: number;
  paddingBottom?: number;
  paddingRight?: number;
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
  colors?: AnsiToSvgColors;
}
