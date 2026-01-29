/**
 * App - Main TUI component
 *
 * Orchestrates all TUI components and handles keyboard input.
 * Supports standalone operation with run management.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './Header.js';
import { AgentPanel } from './AgentPanel.js';
import { OutputView } from './OutputView.js';
import { ProgressBar } from './ProgressBar.js';
import { CRPPrompt } from './CRPPrompt.js';
import { NewRunPrompt } from './NewRunPrompt.js';
import { RunListScreen } from './RunListScreen.js';
import { MRPViewer } from './MRPViewer.js';
import { FailureViewer } from './FailureViewer.js';
import { useDashboardData } from './hooks/useDashboardData.js';
import type { AgentName, DashboardData, RunListItem, MRPEvidence, VCR, CRP, GatekeeperVerdict } from '../../types/index.js';
import type { DashboardDataProvider } from '../../core/dashboard-data-provider.js';

type AppMode = 'view' | 'newrun' | 'list' | 'mrp' | 'failure';

interface AppProps {
  provider: DashboardDataProvider | null;
  onDetach?: () => void;
  onNewRun?: (briefing: string) => Promise<string>;
  onSelectRun?: (runId: string) => void;
  onStopRun?: () => Promise<void>;
  onRefresh?: () => void;
  onSubmitVCR?: (vcr: VCR) => Promise<void>;
  runs?: RunListItem[];
  mrpEvidence?: MRPEvidence | null;
  currentCRP?: CRP | null;
  verdict?: GatekeeperVerdict | null;
}

const AGENT_ORDER: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

/**
 * Create empty dashboard data for initial render
 */
function createEmptyData(): DashboardData {
  const emptyAgent = {
    status: 'idle' as const,
    output: '',
  };

  return {
    runId: '',
    stage: 'REFINE',
    agents: {
      refiner: { ...emptyAgent },
      builder: { ...emptyAgent },
      verifier: { ...emptyAgent },
      gatekeeper: { ...emptyAgent },
    },
    usage: {
      totalTokens: 0,
      cost: 0,
    },
    progress: {
      currentStep: 0,
      totalSteps: 4,
      retryCount: 0,
    },
  };
}

/**
 * Generate VCR ID from timestamp
 */
function generateVcrId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `vcr-${timestamp}`;
}

export function App({
  provider,
  onDetach,
  onNewRun,
  onSelectRun,
  onStopRun,
  onRefresh,
  onSubmitVCR,
  runs = [],
  mrpEvidence = null,
  currentCRP = null,
  verdict = null,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { data, loading, error, selectedAgent, selectAgent } = useDashboardData(provider);

  // Mode and modal states
  const [mode, setMode] = useState<AppMode>('view');
  const [showingCRP, setShowingCRP] = useState(false);
  const [crpSubmitting, setCrpSubmitting] = useState(false);

  // New run states
  const [newRunLoading, setNewRunLoading] = useState(false);
  const [newRunError, setNewRunError] = useState<string | null>(null);

  // Run list states
  const [runsLoading, setRunsLoading] = useState(false);

  // MRP states
  const [mrpLoading, setMrpLoading] = useState(false);

  // Handle keyboard input
  useInput((input, key) => {
    // CRP modal takes priority
    if (showingCRP) {
      if (key.escape) {
        setShowingCRP(false);
      }
      return;
    }

    // Mode-specific handling
    if (mode !== 'view') {
      return;
    }

    // Number keys 1-4 to select agents
    if (input >= '1' && input <= '4') {
      const index = parseInt(input, 10) - 1;
      if (index < AGENT_ORDER.length) {
        selectAgent(AGENT_ORDER[index]);
      }
      return;
    }

    // 'n' to create new run
    if (input === 'n') {
      setMode('newrun');
      setNewRunError(null);
      return;
    }

    // 'l' to list runs
    if (input === 'l') {
      setMode('list');
      setRunsLoading(false);
      return;
    }

    // 'm' to view MRP
    if (input === 'm') {
      setMode('mrp');
      setMrpLoading(false);
      return;
    }

    // 'f' to view failure details
    if (input === 'f') {
      setMode('failure');
      return;
    }

    // 's' to stop run
    if (input === 's') {
      handleStop();
      return;
    }

    // 'r' to refresh
    if (input === 'r') {
      onRefresh?.();
      return;
    }

    // 'q' to quit
    if (input === 'q') {
      exit();
      return;
    }

    // 'd' to detach
    if (input === 'd') {
      onDetach?.();
      exit();
      return;
    }
  });

  // Handle stop
  const handleStop = useCallback(async () => {
    if (onStopRun) {
      try {
        await onStopRun();
      } catch {
        // Ignore errors
      }
    }
  }, [onStopRun]);

  // Handle new run submit
  const handleNewRunSubmit = useCallback(async (briefing: string) => {
    if (!onNewRun) {
      setNewRunError('New run not supported');
      return;
    }

    setNewRunLoading(true);
    setNewRunError(null);

    try {
      await onNewRun(briefing);
      setMode('view');
    } catch (err) {
      setNewRunError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setNewRunLoading(false);
    }
  }, [onNewRun]);

  // Handle new run cancel
  const handleNewRunCancel = useCallback(() => {
    setMode('view');
    setNewRunError(null);
  }, []);

  // Handle run selection
  const handleRunSelect = useCallback((runId: string) => {
    onSelectRun?.(runId);
    setMode('view');
  }, [onSelectRun]);

  // Handle run list cancel
  const handleRunListCancel = useCallback(() => {
    setMode('view');
  }, []);

  // Handle MRP close
  const handleMRPClose = useCallback(() => {
    setMode('view');
  }, []);

  // Handle Failure close
  const handleFailureClose = useCallback(() => {
    setMode('view');
  }, []);

  // Handle CRP submit
  const handleCRPSubmit = useCallback(async (selectedOption: number, selectedOptionText: string) => {
    if (!onSubmitVCR || !currentCRP) {
      setShowingCRP(false);
      return;
    }

    setCrpSubmitting(true);

    try {
      const vcr: VCR = {
        vcr_id: generateVcrId(),
        crp_id: currentCRP.crp_id,
        created_at: new Date().toISOString(),
        decision: selectedOptionText,
        rationale: `Selected option ${selectedOption + 1}`,
        applies_to_future: false,
      };

      await onSubmitVCR(vcr);
      setShowingCRP(false);
    } catch {
      // Show error but keep modal open
    } finally {
      setCrpSubmitting(false);
    }
  }, [onSubmitVCR, currentCRP]);

  // Handle CRP cancel
  const handleCRPCancel = useCallback(() => {
    setShowingCRP(false);
  }, []);

  // Show CRP modal when CRP is available
  useEffect(() => {
    if (data?.crp && !showingCRP && mode === 'view') {
      setShowingCRP(true);
    }
  }, [data?.crp, showingCRP, mode]);

  // Auto-show failure details when run fails
  useEffect(() => {
    if (data?.stage === 'FAILED' && mode === 'view' && (verdict || data?.verdict)) {
      setMode('failure');
    }
  }, [data?.stage, data?.verdict, verdict, mode]);

  // Use actual data or empty data
  const displayData = data ?? createEmptyData();

  // Render mode-specific screens
  if (mode === 'newrun') {
    return (
      <Box flexDirection="column" width="100%">
        <NewRunPrompt
          onSubmit={handleNewRunSubmit}
          onCancel={handleNewRunCancel}
          loading={newRunLoading}
          error={newRunError}
        />
      </Box>
    );
  }

  if (mode === 'list') {
    return (
      <Box flexDirection="column" width="100%">
        <RunListScreen
          runs={runs}
          onSelect={handleRunSelect}
          onCancel={handleRunListCancel}
          loading={runsLoading}
        />
      </Box>
    );
  }

  if (mode === 'mrp') {
    return (
      <Box flexDirection="column" width="100%">
        <MRPViewer
          evidence={mrpEvidence}
          onClose={handleMRPClose}
          loading={mrpLoading}
        />
      </Box>
    );
  }

  if (mode === 'failure') {
    return (
      <Box flexDirection="column" width="100%">
        <FailureViewer
          verdict={verdict ?? displayData.verdict ?? null}
          runId={displayData.runId}
          onClose={handleFailureClose}
        />
      </Box>
    );
  }

  // Loading state
  if (loading && !data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue" bold>Dure</Text>
        <Text>Loading dashboard data...</Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'n' to start a new run, 'l' to list runs, 'q' to quit</Text>
        </Box>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error</Text>
        <Text color="red">{error.message}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'n' to start a new run, 'l' to list runs, 'q' to quit</Text>
        </Box>
      </Box>
    );
  }

  // Get selected agent's output
  const selectedAgentData = displayData.agents[selectedAgent];

  return (
    <Box flexDirection="column" width="100%">
      {/* Header: Run info, stage, tokens, cost */}
      <Header data={displayData} />

      {/* Agent Panel: Status of all agents */}
      <AgentPanel
        agents={displayData.agents}
        selectedAgent={selectedAgent}
        onSelectAgent={selectAgent}
      />

      {/* Output View: Selected agent's output */}
      <OutputView
        agent={selectedAgent}
        output={selectedAgentData.output}
        maxLines={15}
      />

      {/* Progress Bar */}
      <ProgressBar
        progress={displayData.progress}
        stage={displayData.stage}
      />

      {/* CRP Modal (when human input needed) */}
      {showingCRP && displayData.crp && (
        <CRPPrompt
          crp={displayData.crp}
          crpId={currentCRP?.crp_id}
          onSubmit={handleCRPSubmit}
          onCancel={handleCRPCancel}
          submitting={crpSubmitting}
        />
      )}

      {/* Footer: Key bindings */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          [1-4] Agent  [n] New  [l] List  [m] MRP  {displayData.stage === 'FAILED' && '[f] Failure  '}[s] Stop  [r] Refresh  [d] Detach  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
