import blessed from 'blessed';
import type { Widgets } from 'blessed';

export type TuiMode = 'viewing' | 'input' | 'list' | 'crp' | 'mrp';

export interface StatusBarOptions {
  parent: Widgets.Screen | Widgets.BoxElement;
}

export interface StatusBarComponent {
  container: Widgets.BoxElement;
  setMode: (mode: TuiMode) => void;
  setMessage: (message: string) => void;
  clearMessage: () => void;
  setCrpPending: (pending: boolean) => void;
  destroy: () => void;
}

interface ModeConfig {
  hints: string;
  label: string;
}

const MODE_CONFIGS: Record<TuiMode, ModeConfig> = {
  viewing: {
    hints: ' {bold}[n]{/bold}ew  {bold}[l]{/bold}ist  {bold}[c]{/bold}rp  {bold}[m]{/bold}rp  {bold}[s]{/bold}top  {bold}[q]{/bold}uit ',
    label: 'VIEWING',
  },
  input: {
    hints: ' {bold}[Ctrl+Enter]{/bold} submit  {bold}[Esc]{/bold} cancel ',
    label: 'INPUT',
  },
  list: {
    hints: ' {bold}[\u2191\u2193]{/bold} navigate  {bold}[Enter]{/bold} select  {bold}[Esc]{/bold} back ',
    label: 'LIST',
  },
  crp: {
    hints: ' {bold}[\u2191\u2193]{/bold} select option  {bold}[Enter]{/bold} confirm  {bold}[Esc]{/bold} cancel ',
    label: 'CRP',
  },
  mrp: {
    hints: ' {bold}[\u2191\u2193]{/bold} scroll  {bold}[Esc]{/bold} back ',
    label: 'MRP',
  },
};

export function createStatusBar(options: StatusBarOptions): StatusBarComponent {
  const { parent } = options;

  // Main container at the bottom
  const container = blessed.box({
    parent: parent as Widgets.Node,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      fg: 'white',
      bg: 'gray',
    },
  });

  // Left side: mode indicator
  const modeBox = blessed.box({
    parent: container,
    left: 0,
    top: 0,
    width: 12,
    height: 3,
    content: '{center}{bold}VIEWING{/bold}{/center}',
    tags: true,
    style: {
      fg: 'black',
      bg: 'cyan',
    },
  });

  // Center: key hints
  const hintsBox = blessed.box({
    parent: container,
    left: 12,
    top: 0,
    width: '100%-24',
    height: 3,
    content: MODE_CONFIGS.viewing.hints,
    tags: true,
    valign: 'middle',
    style: {
      fg: 'white',
      bg: 'gray',
    },
  });

  // Right side: status indicator (CRP pending, etc.)
  const statusBox = blessed.box({
    parent: container,
    right: 0,
    top: 0,
    width: 12,
    height: 3,
    content: '',
    tags: true,
    style: {
      fg: 'white',
      bg: 'gray',
    },
  });

  let currentMode: TuiMode = 'viewing';
  let currentMessage: string | null = null;
  let crpPending = false;

  function render(): void {
    const config = MODE_CONFIGS[currentMode];

    // Update mode indicator
    modeBox.setContent(`{center}{bold}${config.label}{/bold}{/center}`);

    // Update hints or show message
    if (currentMessage) {
      hintsBox.setContent(` {yellow-fg}${currentMessage}{/yellow-fg} `);
    } else {
      hintsBox.setContent(config.hints);
    }

    // Update CRP indicator
    if (crpPending) {
      statusBox.setContent('{center}{bold}{yellow-fg}[CRP]{/yellow-fg}{/bold}{/center}');
      statusBox.style.bg = 'red';
    } else {
      statusBox.setContent('');
      statusBox.style.bg = 'gray';
    }

    (parent as Widgets.Screen).render();
  }

  function setMode(mode: TuiMode): void {
    currentMode = mode;
    currentMessage = null;
    render();
  }

  function setMessage(message: string): void {
    currentMessage = message;
    render();
  }

  function clearMessage(): void {
    currentMessage = null;
    render();
  }

  function setCrpPending(pending: boolean): void {
    crpPending = pending;
    render();
  }

  function destroy(): void {
    container.destroy();
  }

  // Initial render
  render();

  return {
    container,
    setMode,
    setMessage,
    clearMessage,
    setCrpPending,
    destroy,
  };
}
