/**
 * MissionKanbanScreen - Full-screen kanban board for mission tracking
 *
 * Displays mission progress in a kanban-style layout with keyboard navigation.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Kanban, KanbanAction } from '../components/Kanban.js';
import { KanbanDataProvider } from '../../../core/kanban-data-provider.js';
import { isOk, isErr } from '../../../types/result.js';
import type { KanbanState } from '../../../types/mission.js';
import type { MissionId, TaskId } from '../../../types/branded.js';

// ============================================================================
// Types
// ============================================================================

interface MissionKanbanScreenProps {
  projectRoot: string;
  missionId: MissionId;
  watch?: boolean;
}

interface SelectionIndex {
  phase: number;
  task: number;
}

// ============================================================================
// Component
// ============================================================================

export function MissionKanbanScreen({
  projectRoot,
  missionId,
  watch = false,
}: MissionKanbanScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<KanbanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | undefined>();
  const [selectedIndex, setSelectedIndex] = useState<SelectionIndex>({ phase: 0, task: 0 });

  // Create provider once
  const provider = useMemo(
    () => new KanbanDataProvider(projectRoot, missionId),
    [projectRoot, missionId]
  );

  // Initial load
  useEffect(() => {
    const load = async () => {
      const result = await provider.getState();
      if (isOk(result)) {
        setState(result.data);
        updateSelectedFromIndex(result.data, selectedIndex);
      } else {
        setError(result.error.message);
      }
    };
    load();
  }, [provider]);

  // Watch mode
  useEffect(() => {
    if (!watch) return;

    const startWatch = async () => {
      provider.on('state:updated', (event: { data: KanbanState }) => {
        setState(event.data);
      });

      provider.on('error', (event: { data: Error }) => {
        setError(event.data.message);
      });

      const result = await provider.startWatching();
      if (isErr(result)) {
        setError(result.error.message);
      }
    };

    startWatch();

    return () => {
      provider.stopWatching();
      provider.removeAllListeners();
    };
  }, [provider, watch]);

  // Update selected task from index
  const updateSelectedFromIndex = useCallback(
    (kanbanState: KanbanState, index: SelectionIndex) => {
      const column = kanbanState.columns[index.phase];
      const card = column?.cards[index.task];
      setSelectedTask(card?.task_id);
    },
    []
  );

  // Move selection
  const moveSelection = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!state) return;

      let { phase, task } = selectedIndex;

      switch (direction) {
        case 'up':
          task = Math.max(0, task - 1);
          break;
        case 'down': {
          const maxTask = (state.columns[phase]?.cards.length ?? 1) - 1;
          task = Math.min(maxTask, task + 1);
          break;
        }
        case 'left':
          phase = Math.max(0, phase - 1);
          task = Math.min(task, (state.columns[phase]?.cards.length ?? 1) - 1);
          break;
        case 'right':
          phase = Math.min(state.columns.length - 1, phase + 1);
          task = Math.min(task, (state.columns[phase]?.cards.length ?? 1) - 1);
          break;
      }

      const newIndex = { phase, task };
      setSelectedIndex(newIndex);
      updateSelectedFromIndex(state, newIndex);
    },
    [state, selectedIndex, updateSelectedFromIndex]
  );

  // Handle actions
  const handleEnter = useCallback(() => {
    if (selectedTask) {
      // Could show task details or trigger action
      // For now, just log
    }
  }, [selectedTask]);

  const handleRetry = useCallback(() => {
    if (!selectedTask) return;

    const card = provider.getTask(selectedTask as TaskId);
    if (card?.status === 'failed') {
      // TODO: Implement retry via MissionManager
    }
  }, [selectedTask, provider]);

  const handleSkip = useCallback(() => {
    if (!selectedTask) return;
    // TODO: Implement skip via MissionManager
  }, [selectedTask]);

  // Keyboard input
  useInput((input, key) => {
    if (!state) return;

    // Quit
    if (input === 'q') {
      exit();
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      moveSelection('up');
    } else if (key.downArrow || input === 'j') {
      moveSelection('down');
    } else if (key.leftArrow || input === 'h') {
      moveSelection('left');
    } else if (key.rightArrow || input === 'l') {
      moveSelection('right');
    } else if (key.return) {
      handleEnter();
    } else if (input === 'r') {
      handleRetry();
    } else if (input === 's') {
      handleSkip();
    }
  });

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Error
        </Text>
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'q' to quit</Text>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (!state) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Loading mission kanban...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Kanban board */}
      <Kanban
        state={state}
        selectedTask={selectedTask}
        onSelectTask={setSelectedTask}
      />

      {/* Help */}
      <Box marginTop={1} paddingX={1}>
        <Text color="gray">
          Arrow/hjkl: Navigate | Enter: Details | r: Retry | s: Skip | q: Quit
        </Text>
      </Box>

      {/* Watch mode indicator */}
      {watch && (
        <Box paddingX={1}>
          <Text color="cyan">[Watching for changes...]</Text>
        </Box>
      )}
    </Box>
  );
}

export default MissionKanbanScreen;
