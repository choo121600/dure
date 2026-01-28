/**
 * Run List Screen - Display and select from available runs
 */

import blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { TuiStateManager, RunInfo } from '../state/tui-state.js';

export interface RunListScreenOptions {
  screen: Widgets.Screen;
  stateManager: TuiStateManager;
  onSelect: (runId: string) => void;
  onCancel: () => void;
}

export interface RunListScreen {
  show: () => Promise<void>;
  hide: () => void;
  destroy: () => void;
  isVisible: () => boolean;
}

const PHASE_COLORS: Record<string, string> = {
  refine: 'cyan',
  build: 'yellow',
  verify: 'magenta',
  gate: 'blue',
  waiting_human: 'red',
  ready_for_merge: 'green',
  completed: 'green',
  failed: 'red',
};

function formatRunItem(run: RunInfo, index: number, isSelected: boolean): string {
  const marker = isSelected ? '{cyan-fg}>{/cyan-fg}' : ' ';
  const phaseColor = PHASE_COLORS[run.phase] || 'white';
  const crpBadge = run.hasCrp ? ' {red-fg}[CRP]{/red-fg}' : '';
  const iterInfo = run.iteration > 1 ? ` (iter ${run.iteration})` : '';

  const date = new Date(run.updatedAt);
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${marker} {bold}${run.runId}{/bold}${crpBadge}\n  {${phaseColor}-fg}${run.phase}{/${phaseColor}-fg}${iterInfo} | {gray-fg}${dateStr} ${timeStr}{/gray-fg}`;
}

export function createRunListScreen(options: RunListScreenOptions): RunListScreen {
  const { screen, stateManager, onSelect, onCancel } = options;

  let isShowing = false;
  let overlay: Widgets.BoxElement | null = null;
  let list: Widgets.ListElement | null = null;
  let runs: RunInfo[] = [];
  let selectedIndex = 0;

  async function show(): Promise<void> {
    if (isShowing) return;
    isShowing = true;

    // Load runs
    runs = await stateManager.listRuns();

    if (runs.length === 0) {
      showNoRunsMessage();
      return;
    }

    // Create overlay
    overlay = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: {
        bg: 'black',
      },
    });

    // Title
    blessed.box({
      parent: overlay,
      top: 1,
      left: 'center',
      width: '80%',
      height: 3,
      content: `{center}{bold}{cyan-fg}Run List{/cyan-fg}{/bold}\n{gray-fg}${runs.length} run(s) available{/gray-fg}{/center}`,
      tags: true,
    });

    // Current run indicator
    const currentRunId = stateManager.getCurrentRunId();
    if (currentRunId) {
      blessed.box({
        parent: overlay,
        top: 4,
        left: 'center',
        width: '80%',
        height: 1,
        content: `{center}{gray-fg}Current: {yellow-fg}${currentRunId}{/yellow-fg}{/gray-fg}{/center}`,
        tags: true,
      });
    }

    // Create list items
    const items = runs.map((run, index) => formatRunItem(run, index, index === selectedIndex));

    list = blessed.list({
      parent: overlay,
      top: 6,
      left: 'center',
      width: '80%',
      height: '100%-12',
      items,
      tags: true,
      keys: true,
      vi: false,
      mouse: true,
      interactive: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'gray',
        },
        style: {
          inverse: true,
        },
      },
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
        },
        item: {
          fg: 'white',
        },
      },
    });

    list.select(selectedIndex);
    list.focus();

    // Navigation
    list.key(['up', 'k'], () => {
      selectedIndex = Math.max(0, selectedIndex - 1);
      updateListItems();
      list?.select(selectedIndex);
      screen.render();
    });

    list.key(['down', 'j'], () => {
      selectedIndex = Math.min(runs.length - 1, selectedIndex + 1);
      updateListItems();
      list?.select(selectedIndex);
      screen.render();
    });

    // Select
    list.key(['enter'], () => {
      const selectedRun = runs[selectedIndex];
      if (selectedRun) {
        hide();
        onSelect(selectedRun.runId);
      }
    });

    // Cancel
    list.key(['escape', 'q'], () => {
      hide();
      onCancel();
    });

    // Instructions
    blessed.box({
      parent: overlay,
      bottom: 1,
      left: 'center',
      width: '80%',
      height: 1,
      content: '{center}{gray-fg}Up/Down: Navigate | Enter: Select | Esc: Cancel{/gray-fg}{/center}',
      tags: true,
    });

    screen.render();
  }

  function updateListItems(): void {
    if (!list) return;
    const items = runs.map((run, index) => formatRunItem(run, index, index === selectedIndex));
    list.setItems(items);
  }

  function showNoRunsMessage(): void {
    overlay = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: {
        bg: 'black',
      },
    });

    blessed.box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 50,
      height: 7,
      border: {
        type: 'line',
      },
      label: ' Run List ',
      content: '{center}{yellow-fg}No runs found{/yellow-fg}\n\nPress {bold}[n]{/bold} to create a new run.{/center}',
      tags: true,
      style: {
        border: {
          fg: 'yellow',
        },
        label: {
          fg: 'yellow',
        },
      },
    });

    blessed.box({
      parent: overlay,
      bottom: 1,
      left: 'center',
      width: '80%',
      height: 1,
      content: '{center}{gray-fg}Press Esc to close{/gray-fg}{/center}',
      tags: true,
    });

    overlay.key(['escape', 'q', 'enter'], () => {
      hide();
      onCancel();
    });

    overlay.focus();
    screen.render();
  }

  function hide(): void {
    if (!isShowing) return;
    isShowing = false;

    if (list) {
      list.destroy();
      list = null;
    }

    if (overlay) {
      overlay.destroy();
      overlay = null;
    }

    runs = [];
    selectedIndex = 0;

    screen.render();
  }

  function destroy(): void {
    hide();
  }

  function isVisible(): boolean {
    return isShowing;
  }

  return {
    show,
    hide,
    destroy,
    isVisible,
  };
}
