/**
 * App - Main TUI component with tab navigation
 *
 * Orchestrates Kanban/Run/History views with K/R/H tab switching.
 * Supports mission lifecycle and standalone operation.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TabHeader } from './components/TabHeader.js';
import { EmptyState } from './components/EmptyState.js';
import { MissionCreatePrompt } from './components/MissionCreatePrompt.js';
import { MissionListScreen } from './components/MissionListScreen.js';
import { KanbanView } from './views/KanbanView.js';
import { RunView } from './views/RunView.js';
import { HistoryView } from './views/HistoryView.js';
import { MRPViewer } from './MRPViewer.js';
import type {
  TabMode,
  ModalMode,
  AgentName,
  RunListItem,
  MRPEvidence,
  VCR,
  CRP,
  MissionId,
  TaskId,
} from '../../types/index.js';
import type { Mission } from '../../types/mission.js';
import type { DashboardDataProvider } from '../../core/dashboard-data-provider.js';

interface TaskContext {
  taskId: TaskId;
  taskTitle: string;
  phaseNumber: number;
}

interface AppProps {
  projectRoot: string;
  provider: DashboardDataProvider | null;
  // Mission state
  activeMission?: Mission | null;
  missions?: Mission[];
  // Run state
  runs?: RunListItem[];
  mrpEvidence?: MRPEvidence | null;
  currentCRP?: CRP | null;
  // Task context (when running from kanban)
  taskContext?: TaskContext | null;
  // Handlers
  onNewMission?: (description: string) => Promise<string>;
  onSelectMission?: (missionId: MissionId) => void;
  onRunTask?: (taskId: TaskId) => Promise<void>;
  onRetryTask?: (taskId: TaskId) => Promise<void>;
  onSkipTask?: (taskId: TaskId) => Promise<void>;
  onSelectRun?: (runId: string) => void;
  onStopRun?: () => Promise<void>;
  onSubmitVCR?: (vcr: VCR) => Promise<void>;
  onRerunAgent?: (agent: AgentName) => Promise<void>;
  onDetach?: () => void;
}

export function App({
  projectRoot,
  provider,
  activeMission = null,
  missions = [],
  runs = [],
  mrpEvidence = null,
  currentCRP = null,
  taskContext = null,
  onNewMission,
  onSelectMission,
  onRunTask,
  onRetryTask,
  onSkipTask,
  onSelectRun,
  onStopRun,
  onSubmitVCR,
  onRerunAgent,
  onDetach,
}: AppProps): React.ReactElement {
  const { exit } = useApp();

  // Tab state: which view is active
  const [activeTab, setActiveTab] = useState<TabMode>('kanban');

  // Modal state: which modal is showing (null = none)
  const [modal, setModal] = useState<ModalMode>(null);

  // MRP view state
  const [showMRP, setShowMRP] = useState(false);

  // Mission creation states
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);

  // Auto-switch to Run tab when task is started
  useEffect(() => {
    if (taskContext && activeTab === 'kanban') {
      setActiveTab('run');
    }
  }, [taskContext, activeTab]);

  // Handle global keyboard input
  useInput((input, key) => {
    // Don't handle input when modal is open
    if (modal !== null || showMRP) {
      return;
    }

    // Tab switching: K/R/H
    if (input === 'K' || input.toLowerCase() === 'k' && !key.ctrl) {
      // Only switch if pressing uppercase K or lowercase k without modifier
      // This allows lowercase k in kanban navigation
      if (input === 'K') {
        setActiveTab('kanban');
        return;
      }
    }

    if (input === 'R' && !key.ctrl) {
      setActiveTab('run');
      return;
    }

    if (input === 'H' && !key.ctrl) {
      setActiveTab('history');
      return;
    }

    // Global actions (always available)
    if (input === 'n') {
      setModal('newmission');
      setMissionError(null);
      return;
    }

    if (input === 'l') {
      setModal('missionlist');
      return;
    }

    if (input === 'm') {
      setShowMRP(true);
      return;
    }

    if (input === 'q') {
      exit();
      return;
    }

    if (input === 'd') {
      onDetach?.();
      exit();
      return;
    }
  });

  // Handle new mission submit
  const handleNewMissionSubmit = useCallback(async (description: string) => {
    if (!onNewMission) {
      setMissionError('Mission creation not supported');
      return;
    }

    setMissionLoading(true);
    setMissionError(null);

    try {
      await onNewMission(description);
      setModal(null);
      setActiveTab('kanban');
    } catch (err) {
      setMissionError(err instanceof Error ? err.message : 'Failed to create mission');
    } finally {
      setMissionLoading(false);
    }
  }, [onNewMission]);

  // Handle mission modal cancel
  const handleModalCancel = useCallback(() => {
    setModal(null);
    setMissionError(null);
  }, []);

  // Handle mission selection
  const handleMissionSelect = useCallback((missionId: string) => {
    onSelectMission?.(missionId as MissionId);
    setModal(null);
    setActiveTab('kanban');
  }, [onSelectMission]);

  // Handle MRP close
  const handleMRPClose = useCallback(() => {
    setShowMRP(false);
  }, []);

  // Handle task run from kanban
  const handleRunTask = useCallback(async (taskId: TaskId) => {
    if (onRunTask) {
      await onRunTask(taskId);
      // Tab switch is handled by useEffect watching taskContext
    }
  }, [onRunTask]);

  // Handle run selection from history
  const handleHistorySelectRun = useCallback((runId: string) => {
    onSelectRun?.(runId);
    setActiveTab('run');
  }, [onSelectRun]);

  // Render modals
  if (modal === 'newmission') {
    return (
      <Box flexDirection="column" width="100%">
        <MissionCreatePrompt
          onSubmit={handleNewMissionSubmit}
          onCancel={handleModalCancel}
          loading={missionLoading}
          error={missionError}
        />
      </Box>
    );
  }

  if (modal === 'missionlist') {
    return (
      <Box flexDirection="column" width="100%">
        <MissionListScreen
          missions={missions}
          onSelect={handleMissionSelect}
          onCancel={handleModalCancel}
        />
      </Box>
    );
  }

  if (showMRP) {
    return (
      <Box flexDirection="column" width="100%">
        <MRPViewer
          evidence={mrpEvidence}
          onClose={handleMRPClose}
        />
      </Box>
    );
  }

  // Determine content to render
  const renderContent = () => {
    // Check if we have an active mission for kanban
    const hasMission = activeMission !== null;

    switch (activeTab) {
      case 'kanban':
        if (!hasMission) {
          return <EmptyState />;
        }
        return (
          <KanbanView
            projectRoot={projectRoot}
            missionId={activeMission?.mission_id as MissionId}
            onRunTask={handleRunTask}
            onRetryTask={onRetryTask}
            onSkipTask={onSkipTask}
          />
        );

      case 'run':
        return (
          <RunView
            provider={provider}
            taskContext={taskContext}
            currentCRP={currentCRP}
            onSubmitVCR={onSubmitVCR}
            onStopRun={onStopRun}
            onRerunAgent={onRerunAgent}
          />
        );

      case 'history':
        return (
          <HistoryView
            runs={runs}
            onSelectRun={handleHistorySelectRun}
          />
        );

      default:
        return <EmptyState />;
    }
  };

  return (
    <Box flexDirection="column" width="100%">
      {/* Tab Header */}
      <TabHeader
        activeTab={activeTab}
        missionId={activeMission?.mission_id as MissionId | null}
        missionTitle={activeMission?.title}
        currentPhase={activeMission?.stats.current_phase}
      />

      {/* Content Area */}
      <Box flexDirection="column" flexGrow={1}>
        {renderContent()}
      </Box>

      {/* Global Footer */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text dimColor>
          [n] New Mission  [l] Load  [m] MRP  [K] Kanban  [R] Run  [H] History  [d] Detach  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
