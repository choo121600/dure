/**
 * Kanban - TUI Kanban Board Component
 *
 * Displays mission phases as columns and tasks as cards.
 * Supports status-based coloring and selection.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type {
  KanbanState,
  KanbanColumn,
  KanbanCard,
  MissionTaskStatus,
  PhaseStatus,
} from '../../../types/mission.js';

// ============================================================================
// Types
// ============================================================================

export type KanbanAction =
  | { type: 'retry'; taskId: string }
  | { type: 'skip'; taskId: string }
  | { type: 'respond'; taskId: string };

interface KanbanProps {
  state: KanbanState;
  selectedTask?: string;
  onSelectTask?: (taskId: string) => void;
  onAction?: (action: KanbanAction) => void;
}

interface KanbanColumnProps {
  column: KanbanColumn;
  isLast: boolean;
  selectedTask?: string;
  onSelectTask?: (taskId: string) => void;
}

interface TaskCardProps {
  card: KanbanCard;
  isSelected: boolean;
  onSelect: () => void;
}

interface ProgressBarProps {
  stats: KanbanState['stats'];
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusIcon(status: MissionTaskStatus): string {
  switch (status) {
    case 'passed':
      return 'v';
    case 'in_progress':
      return '>';
    case 'pending':
      return 'o';
    case 'blocked':
      return '.';
    case 'failed':
      return 'x';
    case 'needs_human':
      return '?';
    case 'skipped':
      return '-';
    default:
      return ' ';
  }
}

function getStatusColor(status: MissionTaskStatus): string {
  switch (status) {
    case 'passed':
      return 'green';
    case 'in_progress':
      return 'blue';
    case 'pending':
      return 'yellow';
    case 'blocked':
      return 'gray';
    case 'failed':
      return 'red';
    case 'needs_human':
      return 'magenta';
    case 'skipped':
      return 'gray';
    default:
      return 'white';
  }
}

function getPhaseStatusColor(status: PhaseStatus): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'in_progress':
      return 'blue';
    case 'pending':
      return 'white';
    case 'failed':
      return 'red';
    case 'needs_human':
      return 'magenta';
    default:
      return 'gray';
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 2) + '..';
}

// ============================================================================
// Components
// ============================================================================

/**
 * Header showing mission title and planning status
 */
function KanbanHeader({ state }: { state: KanbanState }): React.ReactElement {
  const planningStatus =
    state.planning_stage === 'approved' ? (
      <Text color="green">DONE</Text>
    ) : (
      <Text color="yellow">{state.planning_stage}</Text>
    );

  return (
    <Box borderStyle="double" borderColor="blue" paddingX={2}>
      <Text bold color="white">
        Mission: {truncate(state.mission_title || state.mission_id, 40)}
      </Text>
      <Box marginLeft={2}>
        <Text color="gray">[Planner: </Text>
        {planningStatus}
        <Text color="gray">]</Text>
      </Box>
    </Box>
  );
}

/**
 * Single task card
 */
function TaskCard({ card, isSelected, onSelect }: TaskCardProps): React.ReactElement {
  const icon = getStatusIcon(card.status);
  const color = getStatusColor(card.status);
  const borderColor = isSelected ? 'cyan' : 'gray';

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={0}
      flexDirection="column"
      width="100%"
    >
      <Box>
        <Text color={color}>{icon} </Text>
        <Text bold>{card.task_id}</Text>
      </Box>
      <Text color="white" wrap="truncate">
        {truncate(card.title, 18)}
      </Text>
      <Text color="gray" dimColor>
        [{card.status}]
      </Text>
      {card.error && (
        <Text color="red" wrap="truncate">
          {truncate(card.error, 15)}
        </Text>
      )}
    </Box>
  );
}

/**
 * Phase column containing task cards
 */
function KanbanColumnComponent({
  column,
  isLast,
  selectedTask,
  onSelectTask,
}: KanbanColumnProps): React.ReactElement {
  const statusColor = getPhaseStatusColor(column.status);

  return (
    <Box flexDirection="column" width={24} marginRight={isLast ? 0 : 2}>
      {/* Phase header */}
      <Box marginBottom={1}>
        <Text bold color={statusColor}>
          Phase {column.number}: {truncate(column.title, 12)}
        </Text>
      </Box>

      {/* Task cards */}
      {column.cards.length === 0 ? (
        <Text color="gray" dimColor>
          (no tasks)
        </Text>
      ) : (
        column.cards.map(card => (
          <TaskCard
            key={card.task_id}
            card={card}
            isSelected={selectedTask === card.task_id}
            onSelect={() => onSelectTask?.(card.task_id)}
          />
        ))
      )}
    </Box>
  );
}

/**
 * Progress bar showing task completion
 */
function ProgressBar({ stats }: ProgressBarProps): React.ReactElement {
  const { passed, total_tasks, failed, in_progress } = stats;
  const progress = total_tasks > 0 ? Math.round((passed / total_tasks) * 100) : 0;

  const barLength = 40;
  const filledLength = total_tasks > 0 ? Math.round((passed / total_tasks) * barLength) : 0;
  const failedLength = total_tasks > 0 ? Math.round((failed / total_tasks) * barLength) : 0;
  const inProgressLength = total_tasks > 0 ? Math.round((in_progress / total_tasks) * barLength) : 0;
  const emptyLength = Math.max(0, barLength - filledLength - failedLength - inProgressLength);

  return (
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="gray">Progress: </Text>
      <Text color="green">{'#'.repeat(Math.max(0, filledLength))}</Text>
      <Text color="blue">{'#'.repeat(Math.max(0, inProgressLength))}</Text>
      <Text color="red">{'#'.repeat(Math.max(0, failedLength))}</Text>
      <Text color="gray">{'-'.repeat(Math.max(0, emptyLength))}</Text>
      <Text>
        {' '}
        {passed}/{total_tasks} ({progress}%)
      </Text>
    </Box>
  );
}

/**
 * Legend showing status icon meanings
 */
function Legend(): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text color="gray">
        <Text color="green">v</Text> Pass{' '}
        <Text color="blue">{'>'}</Text> Running{' '}
        <Text color="yellow">o</Text> Pending{' '}
        <Text color="gray">.</Text> Blocked{' '}
        <Text color="red">x</Text> Failed{' '}
        <Text color="magenta">?</Text> Human
      </Text>
    </Box>
  );
}

// ============================================================================
// Main Kanban Component
// ============================================================================

export function Kanban({
  state,
  selectedTask,
  onSelectTask,
  onAction,
}: KanbanProps): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <KanbanHeader state={state} />

      {/* Phase columns */}
      <Box marginTop={1} flexWrap="wrap">
        {state.columns.map((column, index) => (
          <KanbanColumnComponent
            key={column.phase_id}
            column={column}
            isLast={index === state.columns.length - 1}
            selectedTask={selectedTask}
            onSelectTask={onSelectTask}
          />
        ))}
      </Box>

      {/* Progress bar */}
      <ProgressBar stats={state.stats} />

      {/* Legend */}
      <Legend />
    </Box>
  );
}

export default Kanban;
