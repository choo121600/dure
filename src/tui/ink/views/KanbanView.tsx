/**
 * KanbanView - Kanban tab content
 *
 * Displays mission kanban board with task navigation and actions.
 */
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Kanban } from '../components/Kanban.js';
import { useKanbanData } from '../hooks/useKanbanData.js';
import type { MissionId, TaskId } from '../../../types/branded.js';

interface KanbanViewProps {
  projectRoot: string;
  missionId: MissionId | null;
  onRunTask?: (taskId: TaskId) => void;
  onRetryTask?: (taskId: TaskId) => void;
  onSkipTask?: (taskId: TaskId) => void;
}

export function KanbanView({
  projectRoot,
  missionId,
  onRunTask,
  onRetryTask,
  onSkipTask,
}: KanbanViewProps): React.ReactElement {
  const {
    state,
    loading,
    error,
    selectedTask,
    moveSelection,
    selectTask,
    getSelectedCard,
  } = useKanbanData(projectRoot, missionId, true);

  // Handle keyboard input for kanban navigation
  useInput((input, key) => {
    if (!state) return;

    // Navigation: hjkl / arrow keys
    if (key.upArrow || input === 'k') {
      moveSelection('up');
    } else if (key.downArrow || input === 'j') {
      moveSelection('down');
    } else if (key.leftArrow || input === 'h') {
      moveSelection('left');
    } else if (key.rightArrow || input === 'l') {
      moveSelection('right');
    }

    // Actions
    if (key.return && selectedTask) {
      // Run the selected task
      const card = getSelectedCard();
      if (card && (card.status === 'pending' || card.status === 'blocked')) {
        onRunTask?.(selectedTask);
      }
    }

    if (input === 'r' && selectedTask) {
      // Retry failed task
      const card = getSelectedCard();
      if (card && card.status === 'failed') {
        onRetryTask?.(selectedTask);
      }
    }

    if (input === 's' && selectedTask) {
      // Skip task
      const card = getSelectedCard();
      if (card && (card.status === 'pending' || card.status === 'failed' || card.status === 'needs_human')) {
        onSkipTask?.(selectedTask);
      }
    }
  });

  // Loading state
  if (loading && !state) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Loading kanban...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error loading kanban</Text>
        <Text color="red">{error.message}</Text>
      </Box>
    );
  }

  // No mission selected
  if (!state) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No mission selected</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Kanban board */}
      <Kanban
        state={state}
        selectedTask={selectedTask}
        onSelectTask={(taskId) => selectTask(taskId as TaskId)}
      />

      {/* Action hints */}
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>
          [hjkl/Arrows] Navigate  [Enter] Run Task  [r] Retry  [s] Skip
        </Text>
      </Box>
    </Box>
  );
}

export default KanbanView;
