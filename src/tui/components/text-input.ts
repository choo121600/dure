import blessed from 'blessed';
import type { Widgets } from 'blessed';

export interface TextInputOptions {
  parent: Widgets.Screen | Widgets.BoxElement;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  top?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
}

export interface TextInputComponent {
  container: Widgets.BoxElement;
  textarea: Widgets.TextareaElement;
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  blur: () => void;
  destroy: () => void;
  onSubmit: (callback: (value: string) => void) => void;
  onCancel: (callback: () => void) => void;
}

export function createTextInput(options: TextInputOptions): TextInputComponent {
  const {
    parent,
    label = 'Input',
    placeholder = 'Enter text...',
    initialValue = '',
    top = 'center',
    left = 'center',
    width = '80%',
    height = '60%',
  } = options;

  let submitCallback: ((value: string) => void) | null = null;
  let cancelCallback: (() => void) | null = null;

  // Container box
  const container = blessed.box({
    parent: parent as Widgets.Node,
    top,
    left,
    width,
    height,
    border: {
      type: 'line',
    },
    label: ` ${label} `,
    tags: true,
    style: {
      border: {
        fg: 'cyan',
      },
      label: {
        fg: 'cyan',
        bold: true,
      },
    },
  });

  // Instructions
  const instructions = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '{gray-fg}Ctrl+S: Submit | Esc: Cancel{/gray-fg}',
    tags: true,
    style: {
      fg: 'gray',
    },
  });

  // Textarea for multiline input
  const textarea = blessed.textarea({
    parent: container,
    top: 2,
    left: 1,
    width: '100%-4',
    height: '100%-4',
    inputOnFocus: true,
    mouse: true,
    keys: true,
    vi: false,
    style: {
      fg: 'white',
      bg: 'black',
      focus: {
        fg: 'white',
        bg: 'black',
      },
    },
  }) as Widgets.TextareaElement;

  // Set initial value
  if (initialValue) {
    textarea.setValue(initialValue);
  }

  // Handle Ctrl+Enter (submit)
  // blessed textarea captures 'enter' for newlines, we need C-enter
  textarea.key(['C-enter'], () => {
    const value = textarea.getValue().trim();
    if (value && submitCallback) {
      submitCallback(value);
    }
  });

  // Also handle Ctrl+S as an alternative submit
  textarea.key(['C-s'], () => {
    const value = textarea.getValue().trim();
    if (value && submitCallback) {
      submitCallback(value);
    }
  });

  // Handle Escape (cancel)
  textarea.key(['escape'], () => {
    if (cancelCallback) {
      cancelCallback();
    }
  });

  // Get screen for render
  const screen = (parent as Widgets.Screen).screen || parent;

  function getValue(): string {
    return textarea.getValue();
  }

  function setValue(value: string): void {
    textarea.setValue(value);
    (screen as Widgets.Screen).render();
  }

  function focus(): void {
    textarea.focus();
    (screen as Widgets.Screen).render();
  }

  function blur(): void {
    textarea.cancel();
    (screen as Widgets.Screen).render();
  }

  function destroy(): void {
    container.destroy();
    (screen as Widgets.Screen).render();
  }

  function onSubmit(callback: (value: string) => void): void {
    submitCallback = callback;
  }

  function onCancel(callback: () => void): void {
    cancelCallback = callback;
  }

  return {
    container,
    textarea,
    getValue,
    setValue,
    focus,
    blur,
    destroy,
    onSubmit,
    onCancel,
  };
}
