import blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { CRP, CRPOption, CRPQuestion } from '../../types/index.js';

export interface CrpNotificationOptions {
  parent: Widgets.Screen | Widgets.BoxElement;
  top?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
}

export interface CrpNotificationComponent {
  container: Widgets.BoxElement;
  show: (crp: CRP) => void;
  hide: () => void;
  isVisible: () => boolean;
  destroy: () => void;
}

const CRP_TYPE_LABELS: Record<string, string> = {
  clarification: 'Clarification',
  architecture: 'Architecture',
  security: 'Security',
  dependency: 'Dependency',
  architecture_decision: 'Architecture Decision',
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function formatQuestion(crp: CRP): string {
  // Handle multi-question format
  if (crp.questions && crp.questions.length > 0) {
    const firstQuestion = crp.questions[0];
    return truncateText(firstQuestion.question, 60);
  }
  // Handle single-question format
  if (crp.question) {
    return truncateText(crp.question, 60);
  }
  return 'Human decision required';
}

function getOptions(crp: CRP): CRPOption[] {
  // Handle multi-question format
  if (crp.questions && crp.questions.length > 0) {
    const firstQuestion = crp.questions[0];
    return firstQuestion.options || [];
  }
  // Handle single-question format
  return crp.options || [];
}

export function createCrpNotification(options: CrpNotificationOptions): CrpNotificationComponent {
  const {
    parent,
    top = 0,
    left = 0,
    width = '100%',
    height = 7,
  } = options;

  let visible = false;
  let currentCrp: CRP | null = null;

  // Main container - initially hidden
  const container = blessed.box({
    parent: parent as Widgets.Node,
    top,
    left,
    width,
    height,
    hidden: true,
    border: {
      type: 'line',
    },
    label: ' {bold}{yellow-fg}CRP Pending{/yellow-fg}{/bold} ',
    tags: true,
    style: {
      border: {
        fg: 'yellow',
      },
      bg: 'black',
    },
  });

  // Type badge
  const typeBadge = blessed.box({
    parent: container,
    top: 0,
    left: 1,
    width: 20,
    height: 1,
    content: '',
    tags: true,
  });

  // Question text
  const questionBox = blessed.box({
    parent: container,
    top: 1,
    left: 1,
    width: '100%-4',
    height: 1,
    content: '',
    tags: true,
  });

  // Options preview
  const optionsBox = blessed.box({
    parent: container,
    top: 2,
    left: 1,
    width: '100%-4',
    height: 2,
    content: '',
    tags: true,
  });

  // Action hint
  const hintBox = blessed.box({
    parent: container,
    top: 4,
    right: 1,
    width: 30,
    height: 1,
    content: '{gray-fg}Press {bold}[c]{/bold} to respond{/gray-fg}',
    tags: true,
    align: 'right',
  });

  function show(crp: CRP): void {
    currentCrp = crp;
    visible = true;

    // Update type badge
    const typeLabel = CRP_TYPE_LABELS[crp.type] || crp.type;
    typeBadge.setContent(`{cyan-fg}[${typeLabel}]{/cyan-fg}`);

    // Update question
    const question = formatQuestion(crp);
    questionBox.setContent(`{bold}{white-fg}${question}{/white-fg}{/bold}`);

    // Update options preview
    const opts = getOptions(crp);
    if (opts.length > 0) {
      const optionLabels = opts
        .slice(0, 3)
        .map((opt, i) => `${i + 1}. ${truncateText(opt.label, 25)}`)
        .join('  ');
      const suffix = opts.length > 3 ? ` (+${opts.length - 3} more)` : '';
      optionsBox.setContent(`{gray-fg}Options: ${optionLabels}${suffix}{/gray-fg}`);
    } else {
      optionsBox.setContent('{gray-fg}Free-form response required{/gray-fg}');
    }

    // Show recommendation if available
    const recommendation = crp.recommendation ||
      (crp.questions?.[0]?.recommendation);
    if (recommendation) {
      hintBox.setContent(`{green-fg}Rec: ${truncateText(recommendation, 15)}{/green-fg} | {gray-fg}Press {bold}[c]{/bold}{/gray-fg}`);
    }

    container.show();
    (parent as Widgets.Screen).render();
  }

  function hide(): void {
    visible = false;
    currentCrp = null;
    container.hide();
    (parent as Widgets.Screen).render();
  }

  function isVisible(): boolean {
    return visible;
  }

  function destroy(): void {
    container.destroy();
  }

  return {
    container,
    show,
    hide,
    isVisible,
    destroy,
  };
}
