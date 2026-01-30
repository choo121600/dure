/**
 * useKanbanData - React hook for subscribing to KanbanDataProvider
 *
 * Provides real-time kanban state updates and navigation helpers.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { KanbanState, KanbanCard } from '../../../types/mission.js';
import type { MissionId, TaskId } from '../../../types/branded.js';
import { KanbanDataProvider } from '../../../core/kanban-data-provider.js';
import { isOk, isErr } from '../../../types/result.js';

export interface SelectionIndex {
  phase: number;
  task: number;
}

export interface UseKanbanDataResult {
  state: KanbanState | null;
  loading: boolean;
  error: Error | null;
  selectedTask: TaskId | undefined;
  selectedIndex: SelectionIndex;
  selectTask: (taskId: TaskId) => void;
  moveSelection: (direction: 'up' | 'down' | 'left' | 'right') => void;
  getSelectedCard: () => KanbanCard | undefined;
  refresh: () => Promise<void>;
}

/**
 * Hook to subscribe to kanban state updates with navigation support
 */
export function useKanbanData(
  projectRoot: string,
  missionId: MissionId | null,
  watch: boolean = true
): UseKanbanDataResult {
  const [state, setState] = useState<KanbanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskId | undefined>();
  const [selectedIndex, setSelectedIndex] = useState<SelectionIndex>({ phase: 0, task: 0 });

  // Create provider once per missionId
  const provider = useMemo(() => {
    if (!missionId) return null;
    return new KanbanDataProvider(projectRoot, missionId);
  }, [projectRoot, missionId]);

  // Update selected task from index
  const updateSelectedFromIndex = useCallback(
    (kanbanState: KanbanState, index: SelectionIndex) => {
      const column = kanbanState.columns[index.phase];
      const card = column?.cards[index.task];
      setSelectedTask(card?.task_id as TaskId | undefined);
    },
    []
  );

  // Initial load and watch setup
  useEffect(() => {
    if (!provider) {
      setState(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const result = await provider.getState();
      if (isOk(result)) {
        setState(result.data);
        updateSelectedFromIndex(result.data, { phase: 0, task: 0 });
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    };

    load();

    // Set up watching if enabled
    if (watch) {
      const startWatch = async () => {
        provider.on('state:updated', (event: { data: KanbanState }) => {
          setState(event.data);
        });

        provider.on('error', (event: { data: Error }) => {
          setError(event.data);
        });

        const watchResult = await provider.startWatching();
        if (isErr(watchResult)) {
          setError(watchResult.error);
        }
      };

      startWatch();
    }

    return () => {
      if (watch) {
        provider.stopWatching();
        provider.removeAllListeners();
      }
    };
  }, [provider, watch, updateSelectedFromIndex]);

  // Move selection in a direction
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
          task = Math.min(Math.max(0, maxTask), task + 1);
          break;
        }
        case 'left':
          phase = Math.max(0, phase - 1);
          // Clamp task index to new column size
          task = Math.min(task, Math.max(0, (state.columns[phase]?.cards.length ?? 1) - 1));
          break;
        case 'right':
          phase = Math.min(state.columns.length - 1, phase + 1);
          // Clamp task index to new column size
          task = Math.min(task, Math.max(0, (state.columns[phase]?.cards.length ?? 1) - 1));
          break;
      }

      const newIndex = { phase, task };
      setSelectedIndex(newIndex);
      updateSelectedFromIndex(state, newIndex);
    },
    [state, selectedIndex, updateSelectedFromIndex]
  );

  // Select a specific task
  const selectTask = useCallback(
    (taskId: TaskId) => {
      if (!state) return;

      // Find the task in columns
      for (let phaseIdx = 0; phaseIdx < state.columns.length; phaseIdx++) {
        const column = state.columns[phaseIdx];
        for (let taskIdx = 0; taskIdx < column.cards.length; taskIdx++) {
          if (column.cards[taskIdx].task_id === taskId) {
            setSelectedIndex({ phase: phaseIdx, task: taskIdx });
            setSelectedTask(taskId);
            return;
          }
        }
      }
    },
    [state]
  );

  // Get the currently selected card
  const getSelectedCard = useCallback((): KanbanCard | undefined => {
    if (!state || !selectedTask) return undefined;

    for (const column of state.columns) {
      const card = column.cards.find(c => c.task_id === selectedTask);
      if (card) return card;
    }
    return undefined;
  }, [state, selectedTask]);

  // Refresh state from provider
  const refresh = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    const result = await provider.refresh();
    if (isOk(result)) {
      setState(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [provider]);

  return {
    state,
    loading,
    error,
    selectedTask,
    selectedIndex,
    selectTask,
    moveSelection,
    getSelectedCard,
    refresh,
  };
}

export default useKanbanData;
