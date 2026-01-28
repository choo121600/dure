import type { Widgets } from 'blessed';

export interface KeyHandler {
  key: string | string[];
  description: string;
  handler: () => void;
  mode?: 'normal' | 'input' | 'all';
}

export interface KeybindingOptions {
  mode?: 'normal' | 'input';
}

// Default key mappings for reference
export const DEFAULT_KEYS = {
  NEW_RUN: 'n',
  LIST_RUNS: 'l',
  CRP_RESPOND: 'c',
  MRP_VIEW: 'm',
  STOP: 's',
  QUIT: 'q',
  ESCAPE: 'escape',
  ENTER: 'enter',
  UP: 'up',
  DOWN: 'down',
} as const;

export type KeyName = keyof typeof DEFAULT_KEYS;

/**
 * Setup keybindings on a blessed screen
 */
export function setupKeybindings(
  screen: Widgets.Screen,
  handlers: KeyHandler[],
  options: KeybindingOptions = {}
): void {
  const currentMode = options.mode || 'normal';

  for (const handler of handlers) {
    const keys = Array.isArray(handler.key) ? handler.key : [handler.key];
    const handlerMode = handler.mode || 'normal';

    // Skip if mode doesn't match (unless handler is for 'all' modes)
    if (handlerMode !== 'all' && handlerMode !== currentMode) {
      continue;
    }

    screen.key(keys, handler.handler);
  }
}

/**
 * Remove keybindings from a blessed screen
 */
export function removeKeybindings(
  screen: Widgets.Screen,
  handlers: KeyHandler[]
): void {
  for (const handler of handlers) {
    const keys = Array.isArray(handler.key) ? handler.key : [handler.key];
    for (const key of keys) {
      screen.unkey(key, handler.handler);
    }
  }
}

/**
 * Create a formatted keybinding hint string for display in status bar
 */
export function formatKeyHints(handlers: KeyHandler[]): string {
  return handlers
    .filter(h => h.mode !== 'input') // Only show normal mode keys
    .map(h => {
      const key = Array.isArray(h.key) ? h.key[0] : h.key;
      return `{bold}[${key}]{/bold}${h.description.toLowerCase()}`;
    })
    .join('  ');
}

/**
 * Log key press for debugging
 */
export function logKeyPress(key: string, mode: string): void {
  // eslint-disable-next-line no-console
  console.log(`Key pressed: ${key} (mode: ${mode})`);
}
