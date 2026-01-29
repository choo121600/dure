import blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { RunState, AgentName, AgentStatus, Phase } from '../../types/index.js';

export interface DashboardOptions {
  parent: Widgets.Screen | Widgets.BoxElement;
  top?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
}

export interface DashboardComponent {
  container: Widgets.BoxElement;
  header: Widgets.BoxElement;
  agentBoxes: Record<AgentName, Widgets.BoxElement>;
  update: (state: RunState | null) => void;
  destroy: () => void;
}

const AGENT_NAMES: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

const STATUS_COLORS: Record<AgentStatus, string> = {
  pending: 'gray',
  running: 'yellow',
  waiting_test_execution: 'blue',
  completed: 'green',
  failed: 'red',
  timeout: 'magenta',
  waiting_human: 'cyan',
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  pending: 'PENDING',
  running: 'RUNNING',
  waiting_test_execution: 'TESTING',
  completed: 'DONE',
  failed: 'FAILED',
  timeout: 'TIMEOUT',
  waiting_human: 'WAITING',
};

const PHASE_LABELS: Record<Phase, string> = {
  refine: 'Refining',
  build: 'Building',
  verify: 'Verifying',
  gate: 'Reviewing',
  waiting_human: 'Waiting for Human',
  ready_for_merge: 'Ready for Merge',
  completed: 'Completed',
  failed: 'Failed',
};

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '';

  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${Math.floor(durationMs / 1000)}s`;

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function createDashboard(options: DashboardOptions): DashboardComponent {
  const { parent, top = 0, left = 0, width = '100%', height = '100%-3' } = options;

  // Main container
  const container = blessed.box({
    parent: parent as Widgets.Node,
    top,
    left,
    width,
    height,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'gray',
      },
    },
  });

  // Header showing run info
  const header = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}{gray-fg}No active run{/gray-fg}{/center}',
    tags: true,
    style: {
      fg: 'white',
    },
  });

  // Agent boxes container (2x2 grid)
  const agentContainer = blessed.box({
    parent: container,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-3',
  });

  // Create 2x2 grid of agent boxes
  const agentBoxes: Record<AgentName, Widgets.BoxElement> = {} as Record<AgentName, Widgets.BoxElement>;

  AGENT_NAMES.forEach((agent, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;

    const box = blessed.box({
      parent: agentContainer,
      top: `${row * 50}%`,
      left: `${col * 50}%`,
      width: '50%',
      height: '50%',
      border: {
        type: 'line',
      },
      label: ` ${agent.charAt(0).toUpperCase() + agent.slice(1)} `,
      tags: true,
      style: {
        border: {
          fg: 'gray',
        },
        label: {
          fg: 'white',
        },
      },
    });

    // Status content
    const content = blessed.text({
      parent: box,
      top: 'center',
      left: 'center',
      content: '{gray-fg}PENDING{/gray-fg}',
      tags: true,
    });

    agentBoxes[agent] = box;
  });

  // Update function
  function update(state: RunState | null): void {
    if (!state) {
      header.setContent('{center}{gray-fg}No active run{/gray-fg}{/center}');

      AGENT_NAMES.forEach((agent) => {
        const box = agentBoxes[agent];
        box.style.border.fg = 'gray';
        box.setContent('{center}{gray-fg}PENDING{/gray-fg}{/center}');
      });

      (parent as Widgets.Screen).render();
      return;
    }

    // Update header
    const phaseLabel = PHASE_LABELS[state.phase] || state.phase;
    const iterInfo = state.iteration > 1 ? ` (iter ${state.iteration}/${state.max_iterations})` : '';
    const crpInfo = state.pending_crp ? ' {cyan-fg}[CRP]{/cyan-fg}' : '';

    header.setContent(
      `{center}{bold}Run:{/bold} {blue-fg}${state.run_id}{/blue-fg} | ` +
      `{bold}Phase:{/bold} {yellow-fg}${phaseLabel}{/yellow-fg}${iterInfo}${crpInfo}{/center}`
    );

    // Update agent boxes
    AGENT_NAMES.forEach((agent) => {
      const agentState = state.agents[agent];
      const box = agentBoxes[agent];
      const status = agentState.status;
      const color = STATUS_COLORS[status];
      const label = STATUS_LABELS[status];

      box.style.border.fg = color;

      let content = `{${color}-fg}{bold}${label}{/bold}{/${color}-fg}`;

      // Add duration for running/completed
      if (status === 'running' && agentState.started_at) {
        const duration = formatDuration(agentState.started_at);
        content += `\n{gray-fg}${duration}{/gray-fg}`;
      } else if (status === 'completed' && agentState.started_at && agentState.completed_at) {
        const duration = formatDuration(agentState.started_at, agentState.completed_at);
        content += `\n{gray-fg}${duration}{/gray-fg}`;
      }

      // Add error message if failed
      if (status === 'failed' && agentState.error) {
        const shortError = agentState.error.slice(0, 30) + (agentState.error.length > 30 ? '...' : '');
        content += `\n{red-fg}${shortError}{/red-fg}`;
      }

      // Add usage info if available
      if (agentState.usage) {
        const cost = agentState.usage.cost_usd.toFixed(4);
        content += `\n{gray-fg}$${cost}{/gray-fg}`;
      }

      box.setContent(`{center}${content}{/center}`);
    });

    (parent as Widgets.Screen).render();
  }

  // Destroy function
  function destroy(): void {
    container.destroy();
  }

  return {
    container,
    header,
    agentBoxes,
    update,
    destroy,
  };
}
