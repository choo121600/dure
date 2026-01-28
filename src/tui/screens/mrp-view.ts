import blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { MRPEvidence, Verdict } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';

export interface MrpViewScreenOptions {
  screen: Widgets.Screen;
  runManager: RunManager;
  onClose: () => void;
  onError: (error: Error) => void;
}

export interface MrpViewScreen {
  show: (runId: string) => Promise<void>;
  hide: () => void;
  destroy: () => void;
  isVisible: () => boolean;
}

const VERDICT_COLORS: Record<Verdict, string> = {
  PASS: 'green',
  FAIL: 'red',
  NEEDS_HUMAN: 'yellow',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  PASS: 'PASS - Ready for Merge',
  FAIL: 'FAIL - Issues Found',
  NEEDS_HUMAN: 'NEEDS HUMAN - Review Required',
};

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function createMrpViewScreen(options: MrpViewScreenOptions): MrpViewScreen {
  const { screen, runManager, onClose, onError } = options;

  let isShowing = false;
  let overlay: Widgets.BoxElement | null = null;
  let scrollBox: Widgets.BoxElement | null = null;

  async function show(runId: string): Promise<void> {
    if (isShowing) return;
    isShowing = true;

    // Load MRP evidence
    let mrp: MRPEvidence | null = null;
    let mrpSummary: string | null = null;

    try {
      mrp = await runManager.readMRPEvidence(runId);
      mrpSummary = await runManager.readMRPSummary(runId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError(err);
      isShowing = false;
      return;
    }

    if (!mrp) {
      showNoMrpMessage();
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

    renderMrpContent(mrp, mrpSummary);
    screen.render();
  }

  function showNoMrpMessage(): void {
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

    // Message box
    blessed.box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 50,
      height: 7,
      border: {
        type: 'line',
      },
      label: ' MRP Viewer ',
      content: '{center}{yellow-fg}No MRP available{/yellow-fg}\n\nThe run has not completed yet\nor no MRP has been generated.{/center}',
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

    // Instructions
    blessed.box({
      parent: overlay,
      bottom: 1,
      left: 'center',
      width: '90%',
      height: 1,
      content: '{center}{gray-fg}Press Esc to close{/gray-fg}{/center}',
      tags: true,
    });

    // Key bindings
    overlay.key(['escape', 'q'], () => {
      hide();
      onClose();
    });

    overlay.focus();
    screen.render();
  }

  function renderMrpContent(mrp: MRPEvidence, summary: string | null): void {
    if (!overlay) return;

    const verdict = mrp.verdict || 'NEEDS_HUMAN';
    const verdictColor = VERDICT_COLORS[verdict];
    const verdictLabel = VERDICT_LABELS[verdict];

    // Header
    blessed.box({
      parent: overlay,
      top: 1,
      left: 'center',
      width: '90%',
      height: 3,
      content: `{center}{bold}{${verdictColor}-fg}${verdictLabel}{/${verdictColor}-fg}{/bold}\n{gray-fg}Run: ${mrp.run_id || 'N/A'} | Completed: ${mrp.completed_at || 'N/A'}{/gray-fg}{/center}`,
      tags: true,
    });

    // Main scrollable content
    scrollBox = blessed.box({
      parent: overlay,
      top: 5,
      left: 5,
      width: '90%',
      height: '100%-10',
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
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      content: buildMrpContent(mrp, summary),
    });

    scrollBox.focus();

    // Key bindings for scroll
    scrollBox.key(['up', 'k'], () => {
      scrollBox?.scroll(-1);
      screen.render();
    });

    scrollBox.key(['down', 'j'], () => {
      scrollBox?.scroll(1);
      screen.render();
    });

    scrollBox.key(['pageup'], () => {
      scrollBox?.scroll(-10);
      screen.render();
    });

    scrollBox.key(['pagedown'], () => {
      scrollBox?.scroll(10);
      screen.render();
    });

    scrollBox.key(['home', 'g'], () => {
      scrollBox?.scrollTo(0);
      screen.render();
    });

    scrollBox.key(['end', 'G'], () => {
      scrollBox?.scrollTo(scrollBox.getScrollHeight());
      screen.render();
    });

    // Close on Escape or q
    scrollBox.key(['escape', 'q'], () => {
      hide();
      onClose();
    });

    // Instructions
    blessed.box({
      parent: overlay,
      bottom: 1,
      left: 'center',
      width: '90%',
      height: 1,
      content: '{center}{gray-fg}Up/Down: Scroll | PgUp/PgDown: Fast scroll | Home/End: Jump | Esc: Close{/gray-fg}{/center}',
      tags: true,
    });
  }

  function buildMrpContent(mrp: MRPEvidence, summary: string | null): string {
    const sections: string[] = [];

    // Test Results Section
    sections.push('{bold}{cyan-fg}TEST RESULTS{/cyan-fg}{/bold}');
    sections.push('─'.repeat(60));

    const tests = mrp.tests;
    const passRate = tests.total > 0 ? ((tests.passed / tests.total) * 100).toFixed(1) : '0';
    const testColor = tests.failed === 0 ? 'green' : 'red';

    sections.push(`  Total:    {bold}${formatNumber(tests.total)}{/bold}`);
    sections.push(`  Passed:   {${testColor}-fg}{bold}${formatNumber(tests.passed)}{/bold}{/${testColor}-fg}`);
    sections.push(`  Failed:   {${tests.failed > 0 ? 'red' : 'green'}-fg}{bold}${formatNumber(tests.failed)}{/bold}{/${tests.failed > 0 ? 'red' : 'green'}-fg}`);
    sections.push(`  Rate:     {${testColor}-fg}{bold}${passRate}%{/bold}{/${testColor}-fg}`);

    if (tests.coverage !== undefined) {
      const coverageColor = tests.coverage >= 80 ? 'green' : tests.coverage >= 60 ? 'yellow' : 'red';
      sections.push(`  Coverage: {${coverageColor}-fg}{bold}${tests.coverage.toFixed(1)}%{/bold}{/${coverageColor}-fg}`);
    }

    sections.push('');

    // Files Changed Section
    sections.push('{bold}{cyan-fg}FILES CHANGED{/cyan-fg}{/bold}');
    sections.push('─'.repeat(60));

    if (mrp.files_changed && mrp.files_changed.length > 0) {
      for (const file of mrp.files_changed) {
        sections.push(`  {yellow-fg}M{/yellow-fg} ${file}`);
      }
    } else {
      sections.push('  {gray-fg}No files changed{/gray-fg}');
    }

    if (mrp.files_created && mrp.files_created.length > 0) {
      sections.push('');
      sections.push('{bold}{cyan-fg}FILES CREATED{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      for (const file of mrp.files_created) {
        sections.push(`  {green-fg}A{/green-fg} ${file}`);
      }
    }

    // Line changes
    if (mrp.lines_added !== undefined || mrp.lines_deleted !== undefined) {
      sections.push('');
      const added = mrp.lines_added || 0;
      const deleted = mrp.lines_deleted || 0;
      const net = mrp.net_change ?? (added - deleted);
      sections.push(`  Lines: {green-fg}+${formatNumber(added)}{/green-fg} / {red-fg}-${formatNumber(deleted)}{/red-fg} (net: ${net >= 0 ? '+' : ''}${formatNumber(net)})`);
    }

    sections.push('');

    // Iterations Section
    sections.push('{bold}{cyan-fg}ITERATIONS{/cyan-fg}{/bold}');
    sections.push('─'.repeat(60));
    sections.push(`  Completed: {bold}${mrp.iterations}{/bold}${mrp.max_iterations ? ` / ${mrp.max_iterations}` : ''}`);
    sections.push('');

    // Decisions Section
    if (mrp.decisions && mrp.decisions.length > 0) {
      sections.push('{bold}{cyan-fg}DECISIONS{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      for (const decision of mrp.decisions) {
        sections.push(`  - ${decision}`);
      }
      sections.push('');
    }

    // Edge Cases Tested
    if (mrp.edge_cases_tested && mrp.edge_cases_tested.length > 0) {
      sections.push('{bold}{cyan-fg}EDGE CASES TESTED{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      for (const edgeCase of mrp.edge_cases_tested) {
        sections.push(`  {green-fg}✓{/green-fg} ${edgeCase}`);
      }
      sections.push('');
    }

    // Adversarial Findings
    if (mrp.adversarial_findings && mrp.adversarial_findings.length > 0) {
      sections.push('{bold}{red-fg}ADVERSARIAL FINDINGS{/red-fg}{/bold}');
      sections.push('─'.repeat(60));
      for (const finding of mrp.adversarial_findings) {
        sections.push(`  {red-fg}!{/red-fg} ${finding}`);
      }
      sections.push('');
    }

    // Quality Metrics
    if (mrp.quality_metrics && Object.keys(mrp.quality_metrics).length > 0) {
      sections.push('{bold}{cyan-fg}QUALITY METRICS{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      for (const [key, value] of Object.entries(mrp.quality_metrics)) {
        sections.push(`  ${key}: ${JSON.stringify(value)}`);
      }
      sections.push('');
    }

    // Security
    if (mrp.security && Object.keys(mrp.security).length > 0) {
      sections.push('{bold}{cyan-fg}SECURITY{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      for (const [key, value] of Object.entries(mrp.security)) {
        sections.push(`  ${key}: ${JSON.stringify(value)}`);
      }
      sections.push('');
    }

    // Usage/Cost Section
    if (mrp.usage) {
      sections.push('{bold}{cyan-fg}USAGE & COST{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));

      const total = mrp.usage.total;
      sections.push(`  Total Input Tokens:  {bold}${formatNumber(total.total_input_tokens)}{/bold}`);
      sections.push(`  Total Output Tokens: {bold}${formatNumber(total.total_output_tokens)}{/bold}`);

      if (total.total_cache_read_tokens > 0 || total.total_cache_creation_tokens > 0) {
        sections.push(`  Cache Read:          {bold}${formatNumber(total.total_cache_read_tokens)}{/bold}`);
        sections.push(`  Cache Creation:      {bold}${formatNumber(total.total_cache_creation_tokens)}{/bold}`);
      }

      sections.push(`  Total Cost:          {bold}{yellow-fg}${formatCost(total.total_cost_usd)}{/yellow-fg}{/bold}`);
      sections.push('');

      // Per-agent breakdown
      if (mrp.usage.by_agent) {
        sections.push('  {gray-fg}By Agent:{/gray-fg}');
        const agents = ['refiner', 'builder', 'verifier', 'gatekeeper'] as const;
        for (const agent of agents) {
          const agentUsage = mrp.usage.by_agent[agent];
          if (agentUsage) {
            sections.push(`    ${agent.padEnd(12)}: ${formatCost(agentUsage.cost_usd)} (${formatNumber(agentUsage.input_tokens + agentUsage.output_tokens)} tokens)`);
          }
        }
        sections.push('');
      }
    }

    // Gatekeeper Confidence
    if (mrp.gatekeeper_confidence) {
      sections.push('{bold}{cyan-fg}GATEKEEPER CONFIDENCE{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      sections.push(`  ${mrp.gatekeeper_confidence}`);
      sections.push('');
    }

    // Agent Logs
    if (mrp.logs) {
      sections.push('{bold}{cyan-fg}AGENT LOGS{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      const agents = ['refiner', 'builder', 'verifier', 'gatekeeper'] as const;
      for (const agent of agents) {
        const log = mrp.logs[agent];
        if (log) {
          sections.push(`  ${agent}: {gray-fg}${log}{/gray-fg}`);
        }
      }
      sections.push('');
    }

    // Summary (if available)
    if (summary) {
      sections.push('{bold}{cyan-fg}SUMMARY{/cyan-fg}{/bold}');
      sections.push('─'.repeat(60));
      sections.push(summary);
      sections.push('');
    }

    return sections.join('\n');
  }

  function hide(): void {
    if (!isShowing) return;
    isShowing = false;

    if (scrollBox) {
      scrollBox.destroy();
      scrollBox = null;
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
