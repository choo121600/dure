import blessed from 'blessed';
import type { Widgets } from 'blessed';
import { createTextInput, type TextInputComponent } from '../components/text-input.js';
import type { Orchestrator } from '../../core/orchestrator.js';

export interface NewRunScreenOptions {
  screen: Widgets.Screen;
  orchestrator: Orchestrator;
  onSuccess: (runId: string) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}

export interface NewRunScreen {
  show: () => void;
  hide: () => void;
  destroy: () => void;
  isVisible: () => boolean;
}

export function createNewRunScreen(options: NewRunScreenOptions): NewRunScreen {
  const { screen, orchestrator, onSuccess, onCancel, onError } = options;

  let isShowing = false;
  let textInput: TextInputComponent | null = null;
  let overlay: Widgets.BoxElement | null = null;
  let loadingBox: Widgets.BoxElement | null = null;

  function show(): void {
    if (isShowing) return;
    isShowing = true;

    // Create semi-transparent overlay
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

    // Title box
    const titleBox = blessed.box({
      parent: overlay,
      top: 2,
      left: 'center',
      width: '80%',
      height: 3,
      content: '{center}{bold}{cyan-fg}New Run{/cyan-fg}{/bold}{/center}',
      tags: true,
    });

    // Create text input for briefing
    textInput = createTextInput({
      parent: overlay,
      label: 'Briefing',
      placeholder: 'Enter your task briefing...',
      top: 5,
      left: 'center',
      width: '80%',
      height: '70%',
    });

    // Handle submit
    textInput.onSubmit(async (briefing: string) => {
      if (!briefing.trim()) {
        return;
      }

      // Show loading state
      showLoading();

      try {
        const runId = await orchestrator.startRun(briefing);
        hideLoading();
        hide();
        onSuccess(runId);
      } catch (error) {
        hideLoading();
        const err = error instanceof Error ? error : new Error(String(error));
        showError(err.message);
        onError(err);
      }
    });

    // Handle cancel
    textInput.onCancel(() => {
      hide();
      onCancel();
    });

    // Focus on text input
    textInput.focus();
    screen.render();
  }

  function showLoading(): void {
    if (!overlay) return;

    loadingBox = blessed.box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 30,
      height: 5,
      border: {
        type: 'line',
      },
      content: '{center}Starting run...{/center}',
      tags: true,
      style: {
        border: {
          fg: 'yellow',
        },
        bg: 'black',
      },
    });

    screen.render();
  }

  function hideLoading(): void {
    if (loadingBox) {
      loadingBox.destroy();
      loadingBox = null;
    }
    screen.render();
  }

  function showError(message: string): void {
    if (!overlay) return;

    const errorBox = blessed.box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 7,
      border: {
        type: 'line',
      },
      label: ' Error ',
      content: `{center}{red-fg}${message}{/red-fg}\n\n{gray-fg}Press any key to continue{/gray-fg}{/center}`,
      tags: true,
      style: {
        border: {
          fg: 'red',
        },
        label: {
          fg: 'red',
        },
        bg: 'black',
      },
    });

    // Close error on any key
    const closeError = () => {
      errorBox.destroy();
      ['enter', 'escape', 'space'].forEach((key) => {
        screen.unkey(key, closeError);
      });
      if (textInput) {
        textInput.focus();
      }
      screen.render();
    };

    ['enter', 'escape', 'space'].forEach((key) => {
      screen.key(key, closeError);
    });
    screen.render();
  }

  function hide(): void {
    if (!isShowing) return;
    isShowing = false;

    if (textInput) {
      textInput.destroy();
      textInput = null;
    }

    if (loadingBox) {
      loadingBox.destroy();
      loadingBox = null;
    }

    if (overlay) {
      overlay.destroy();
      overlay = null;
    }

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
