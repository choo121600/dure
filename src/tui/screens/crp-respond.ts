import blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { CRP, VCR, CRPOption, CRPQuestion } from '../../types/index.js';
import { createTextInput, type TextInputComponent } from '../components/text-input.js';
import { RunManager } from '../../core/run-manager.js';
import type { Orchestrator } from '../../core/orchestrator.js';

export interface CrpRespondScreenOptions {
  screen: Widgets.Screen;
  orchestrator: Orchestrator;
  runManager: RunManager;
  onSuccess: (vcrId: string) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}

export interface CrpRespondScreen {
  show: (runId: string, crp: CRP) => void;
  hide: () => void;
  destroy: () => void;
  isVisible: () => boolean;
}

interface QuestionState {
  questionId: string;
  selectedOptionId: string | null;
}

const CRP_TYPE_LABELS: Record<string, string> = {
  clarification: 'Clarification Request',
  architecture: 'Architecture Decision',
  security: 'Security Review',
  dependency: 'Dependency Question',
  architecture_decision: 'Architecture Decision',
};

function generateVcrId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `vcr-${timestamp}`;
}

export function createCrpRespondScreen(options: CrpRespondScreenOptions): CrpRespondScreen {
  const { screen, orchestrator, runManager, onSuccess, onCancel, onError } = options;

  let isShowing = false;
  let overlay: Widgets.BoxElement | null = null;
  let currentRunId: string | null = null;
  let currentCrp: CRP | null = null;
  let rationaleInput: TextInputComponent | null = null;
  let selectedOptionIndex = 0;
  let questionStates: QuestionState[] = [];
  let currentQuestionIndex = 0;
  let inRationaleMode = false;

  function show(runId: string, crp: CRP): void {
    if (isShowing) return;
    isShowing = true;
    currentRunId = runId;
    currentCrp = crp;
    selectedOptionIndex = 0;
    inRationaleMode = false;

    // Initialize question states
    if (crp.questions && crp.questions.length > 0) {
      questionStates = crp.questions.map((q) => ({
        questionId: q.id,
        selectedOptionId: null,
      }));
      currentQuestionIndex = 0;
    } else {
      questionStates = [{
        questionId: 'main',
        selectedOptionId: null,
      }];
      currentQuestionIndex = 0;
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

    renderContent();
    screen.render();
  }

  function renderContent(): void {
    if (!overlay || !currentCrp) return;

    // Clear existing content
    overlay.children.slice().forEach((child) => child.destroy());

    const crp = currentCrp;
    const typeLabel = CRP_TYPE_LABELS[crp.type] || crp.type;

    // Title
    blessed.box({
      parent: overlay,
      top: 1,
      left: 'center',
      width: '90%',
      height: 3,
      content: `{center}{bold}{cyan-fg}${typeLabel}{/cyan-fg}{/bold}\n{gray-fg}CRP ID: ${crp.crp_id} | Created by: ${crp.created_by}{/gray-fg}{/center}`,
      tags: true,
    });

    // Get current question
    const isMultiQuestion = crp.questions && crp.questions.length > 0;
    let currentQuestion: CRPQuestion | null = null;
    let questionText: string;
    let contextText: string | undefined;
    let questionOptions: CRPOption[];
    let recommendation: string | undefined;

    if (isMultiQuestion && crp.questions) {
      currentQuestion = crp.questions[currentQuestionIndex];
      questionText = currentQuestion.question;
      contextText = currentQuestion.context;
      questionOptions = currentQuestion.options || [];
      recommendation = currentQuestion.recommendation;
    } else {
      questionText = crp.question || 'Please provide your decision:';
      contextText = crp.context;
      questionOptions = crp.options || [];
      recommendation = crp.recommendation;
    }

    // Question progress indicator (for multi-question)
    if (isMultiQuestion && crp.questions) {
      blessed.box({
        parent: overlay,
        top: 4,
        left: 'center',
        width: '90%',
        height: 1,
        content: `{center}{yellow-fg}Question ${currentQuestionIndex + 1} of ${crp.questions.length}{/yellow-fg}{/center}`,
        tags: true,
      });
    }

    // Question text
    blessed.box({
      parent: overlay,
      top: isMultiQuestion ? 6 : 5,
      left: 5,
      width: '90%',
      height: 3,
      content: `{bold}{white-fg}${questionText}{/white-fg}{/bold}`,
      tags: true,
    });

    // Context (if available)
    let contentTop = isMultiQuestion ? 9 : 8;
    if (contextText) {
      blessed.box({
        parent: overlay,
        top: contentTop,
        left: 5,
        width: '90%',
        height: 3,
        content: `{gray-fg}Context: ${contextText}{/gray-fg}`,
        tags: true,
      });
      contentTop += 3;
    }

    // Recommendation (if available)
    if (recommendation) {
      blessed.box({
        parent: overlay,
        top: contentTop,
        left: 5,
        width: '90%',
        height: 2,
        content: `{green-fg}Recommended: ${recommendation}{/green-fg}`,
        tags: true,
      });
      contentTop += 2;
    }

    contentTop += 1;

    if (!inRationaleMode) {
      // Options display
      if (questionOptions.length > 0) {
        // Create scrollable container for options
        const optionsContainer = blessed.box({
          parent: overlay,
          top: contentTop,
          left: 5,
          width: '90%',
          height: '50%',
          scrollable: true,
          alwaysScroll: true,
          scrollbar: {
            ch: '│',
            style: { fg: 'cyan' },
          },
          keys: true,
          vi: false,
          mouse: true,
        });

        // Render options as individual boxes
        const renderOptions = () => {
          // Clear existing children
          optionsContainer.children.slice().forEach((child) => child.destroy());

          let optionTop = 0;
          questionOptions.forEach((opt, i) => {
            const isSelected = i === selectedOptionIndex;
            const marker = isSelected ? '{cyan-fg}▶{/cyan-fg}' : ' ';
            const riskLabel = opt.risk ? ` {red-fg}[${opt.risk}]{/red-fg}` : '';
            const bgStyle = isSelected ? 'blue' : 'black';

            // Calculate height based on description length
            const descLines = Math.ceil((opt.description?.length || 0) / 70) + 1;
            const optionHeight = 2 + descLines;

            const optionLetter = String.fromCharCode(65 + i); // A, B, C, ...
            blessed.box({
              parent: optionsContainer,
              top: optionTop,
              left: 0,
              width: '100%-2',
              height: optionHeight,
              content: `${marker} {cyan-fg}${optionLetter}.{/cyan-fg} {bold}${opt.label}{/bold}${riskLabel}\n  {gray-fg}${opt.description || ''}{/gray-fg}`,
              tags: true,
              style: {
                fg: 'white',
                bg: bgStyle,
              },
            });

            optionTop += optionHeight + 1;
          });

          // Scroll to selected option
          const scrollTo = questionOptions.slice(0, selectedOptionIndex).reduce((acc, opt, _i) => {
            const descLines = Math.ceil((opt.description?.length || 0) / 70) + 1;
            return acc + 2 + descLines + 1;
          }, 0);
          optionsContainer.scrollTo(scrollTo);

          screen.render();
        };

        renderOptions();
        optionsContainer.focus();

        // Handle option selection with arrow keys
        optionsContainer.key(['up', 'k'], () => {
          selectedOptionIndex = Math.max(0, selectedOptionIndex - 1);
          renderOptions();
        });

        optionsContainer.key(['down', 'j'], () => {
          selectedOptionIndex = Math.min(questionOptions.length - 1, selectedOptionIndex + 1);
          renderOptions();
        });

        // Handle Enter to select
        optionsContainer.key(['enter'], () => {
          handleOptionSelected(questionOptions[selectedOptionIndex]);
        });

        // Handle Escape to cancel
        optionsContainer.key(['escape'], () => {
          hide();
          onCancel();
        });

        // Handle A, B, C... keys for direct option selection
        const optionKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
        optionKeys.forEach((key, i) => {
          if (i < questionOptions.length) {
            optionsContainer.key([key], () => {
              selectedOptionIndex = i;
              renderOptions();
              handleOptionSelected(questionOptions[i]);
            });
          }
        });
      } else {
        // No options - show text input for free-form response
        showRationaleInput(contentTop, true);
      }
    } else {
      // Rationale input mode
      showRationaleInput(contentTop, false);
    }

    // Instructions
    const instructions = inRationaleMode
      ? '{gray-fg}Enter (empty) or Ctrl+S: Submit | Esc: Back{/gray-fg}'
      : '{gray-fg}Up/Down: Navigate | A-J or Enter: Select | Esc: Cancel{/gray-fg}';

    blessed.box({
      parent: overlay,
      bottom: 1,
      left: 'center',
      width: '90%',
      height: 1,
      content: `{center}${instructions}{/center}`,
      tags: true,
    });

    screen.render();
  }

  function showRationaleInput(top: number, isFreeForm: boolean): void {
    if (!overlay) return;

    const label = isFreeForm ? 'Your Decision' : 'Rationale (optional)';
    const placeholder = isFreeForm
      ? 'Enter your decision...'
      : 'Explain your reasoning (optional)...';

    rationaleInput = createTextInput({
      parent: overlay,
      label,
      placeholder,
      top,
      left: 5,
      width: '90%',
      height: isFreeForm ? '50%' : '30%',
    });

    rationaleInput.onSubmit(async (text: string) => {
      if (isFreeForm) {
        // Free-form response
        if (!text.trim()) return;
        await submitVcr(text.trim(), text.trim());
      } else {
        // Rationale for option selection
        await submitVcr(
          getSelectedDecision(),
          text.trim() || 'User selected option via TUI'
        );
      }
    });

    rationaleInput.onCancel(() => {
      if (isFreeForm) {
        hide();
        onCancel();
      } else {
        // Go back to option selection
        inRationaleMode = false;
        renderContent();
      }
    });

    rationaleInput.focus();
    inRationaleMode = true;
  }

  function handleOptionSelected(option: CRPOption): void {
    if (!currentCrp) return;

    // Save the selection
    questionStates[currentQuestionIndex].selectedOptionId = option.id;

    const isMultiQuestion = currentCrp.questions && currentCrp.questions.length > 0;

    if (isMultiQuestion && currentCrp.questions) {
      // Move to next question or rationale
      if (currentQuestionIndex < currentCrp.questions.length - 1) {
        currentQuestionIndex++;
        selectedOptionIndex = 0;
        renderContent();
      } else {
        // All questions answered, show rationale input
        showRationaleInput(
          currentCrp.context ? 15 : 12,
          false
        );
      }
    } else {
      // Single question, show rationale input
      showRationaleInput(
        currentCrp.context ? 12 : 9,
        false
      );
    }
  }

  function getSelectedDecision(): string | Record<string, string> {
    if (!currentCrp) return '';

    const isMultiQuestion = currentCrp.questions && currentCrp.questions.length > 0;

    if (isMultiQuestion) {
      const decisions: Record<string, string> = {};
      for (const state of questionStates) {
        if (state.selectedOptionId) {
          decisions[state.questionId] = state.selectedOptionId;
        }
      }
      return decisions;
    } else {
      return questionStates[0]?.selectedOptionId || '';
    }
  }

  async function submitVcr(decision: string | Record<string, string>, rationale: string): Promise<void> {
    if (!currentRunId || !currentCrp) return;

    const vcr: VCR = {
      vcr_id: generateVcrId(),
      crp_id: currentCrp.crp_id,
      created_at: new Date().toISOString(),
      decision,
      rationale,
      applies_to_future: false,
    };

    // Add decisions field for multi-question
    if (typeof decision === 'object') {
      vcr.decisions = decision;
    }

    try {
      // Show loading state
      showLoading('Saving response...');

      // Save VCR
      await runManager.saveVCR(currentRunId, vcr);

      // Resume run
      showLoading('Resuming agent...');
      await orchestrator.resumeRun(currentRunId);

      hideLoading();
      hide();
      onSuccess(vcr.vcr_id);
    } catch (error) {
      hideLoading();
      const err = error instanceof Error ? error : new Error(String(error));
      showError(err.message);
      onError(err);
    }
  }

  // Custom type for loading box identification
  type LoadingBox = Widgets.BoxElement & { _isLoadingBox?: boolean };

  function showLoading(message: string): void {
    if (!overlay) return;

    // Remove existing loading box if any
    hideLoading();

    const loadingBox: LoadingBox = blessed.box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 40,
      height: 5,
      border: {
        type: 'line',
      },
      content: `{center}${message}{/center}`,
      tags: true,
      style: {
        border: {
          fg: 'yellow',
        },
        bg: 'black',
      },
    });
    loadingBox._isLoadingBox = true;

    screen.render();
  }

  function hideLoading(): void {
    if (!overlay) return;
    overlay.children
      .filter((child) => (child as LoadingBox)._isLoadingBox)
      .forEach((child) => child.destroy());
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

    const closeError = () => {
      errorBox.destroy();
      ['enter', 'escape', 'space'].forEach((key) => {
        screen.unkey(key, closeError);
      });
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

    if (rationaleInput) {
      rationaleInput.destroy();
      rationaleInput = null;
    }

    if (overlay) {
      overlay.destroy();
      overlay = null;
    }

    currentRunId = null;
    currentCrp = null;
    questionStates = [];
    currentQuestionIndex = 0;
    selectedOptionIndex = 0;
    inRationaleMode = false;

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
