/**
 * App - Main TUI component
 *
 * Orchestrates all TUI components and handles keyboard input.
 * Supports standalone operation with run management.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './Header.js';
import { AgentPanel } from './AgentPanel.js';
import { OutputView } from './OutputView.js';
import { ProgressBar } from './ProgressBar.js';
import { CRPPrompt } from './CRPPrompt.js';
import { NewRunPrompt } from './NewRunPrompt.js';
import { RunListScreen } from './RunListScreen.js';
import { MRPViewer } from './MRPViewer.js';
import { useDashboardData } from './hooks/useDashboardData.js';
import type { AgentName, DashboardData, DashboardCRP, RunListItem, MRPEvidence, VCR, CRP } from '../../types/index.js';
import type { DashboardDataProvider } from '../../core/dashboard-data-provider.js';

/**
 * Convert CRP to DashboardCRP format for display
 */
function crpToDashboardCRP(crp: CRP): DashboardCRP {
  return {
    agent: crp.created_by,
    question: crp.question || crp.questions?.[0]?.question || 'Unknown question',
    options: crp.options?.map(o => o.label) || crp.questions?.[0]?.options?.map(o => o.label) || [],
  };
}

type AppMode = 'view' | 'newrun' | 'list' | 'mrp';

interface AppProps {
  provider: DashboardDataProvider | null;
  onDetach?: () => void;
  onNewRun?: (briefing: string) => Promise<string>;
  onSelectRun?: (runId: string) => void;
  onStopRun?: () => Promise<void>;
  onSubmitVCR?: (vcr: VCR) => Promise<void>;
  onRerunAgent?: (agent: AgentName) => Promise<void>;
  runs?: RunListItem[];
  mrpEvidence?: MRPEvidence | null;
  currentCRP?: CRP | null;
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
      maxIterations: 3,
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
  onSubmitVCR,
  onRerunAgent,
  runs = [],
  mrpEvidence = null,
  currentCRP = null,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { data, loading, error, selectedAgent, selectAgent } = useDashboardData(provider);

  // Mode and modal states
  const [mode, setMode] = useState<AppMode>('view');
  const [showingCRP, setShowingCRP] = useState(false);
  const [crpSubmitting, setCrpSubmitting] = useState(false);

  // Combine CRP sources: prefer polling data, fallback to prop
  const effectiveCRP = useMemo((): DashboardCRP | null => {
    if (data?.crp) {
      return data.crp;
    }
    if (currentCRP && currentCRP.status === 'pending') {
      return crpToDashboardCRP(currentCRP);
    }
    return null;
  }, [data?.crp, currentCRP]);

  // New run states
  const [newRunLoading, setNewRunLoading] = useState(false);
  const [newRunError, setNewRunError] = useState<string | null>(null);

  // Run list states
  const [runsLoading, setRunsLoading] = useState(false);

  // MRP states
  const [mrpLoading, setMrpLoading] = useState(false);

  // Rerun states
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunMessage, setRerunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

    // 's' to stop run
    if (input === 's') {
      handleStop();
      return;
    }

    // 'r' to rerun selected agent
    if (input === 'r') {
      handleRerunAgent();
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

  // Handle agent rerun
  const handleRerunAgent = useCallback(async () => {
    if (!onRerunAgent || rerunLoading) return;

    // Check if selected agent can be rerun (failed/completed/timeout status)
    const currentData = data ?? createEmptyData();
    const agentData = currentData.agents[selectedAgent];
    if (agentData.status !== 'error' && agentData.status !== 'done') {
      setRerunMessage({
        type: 'error',
        text: `Cannot rerun ${selectedAgent}: status is '${agentData.status}'. Only error/done agents can be rerun.`,
      });
      // Clear message after 3 seconds
      setTimeout(() => setRerunMessage(null), 3000);
      return;
    }

    setRerunLoading(true);
    setRerunMessage(null);

    try {
      await onRerunAgent(selectedAgent);
      setRerunMessage({
        type: 'success',
        text: `Restarted ${selectedAgent}`,
      });
      // Clear success message after 2 seconds
      setTimeout(() => setRerunMessage(null), 2000);
    } catch (err) {
      setRerunMessage({
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to rerun ${selectedAgent}`,
      });
      // Clear error message after 5 seconds
      setTimeout(() => setRerunMessage(null), 5000);
    } finally {
      setRerunLoading(false);
    }
  }, [onRerunAgent, selectedAgent, data, rerunLoading]);

  // Show CRP modal when CRP is available (from either polling or prop)
  useEffect(() => {
    if (effectiveCRP && !showingCRP && mode === 'view') {
      setShowingCRP(true);
    }
  }, [effectiveCRP, showingCRP, mode]);

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
        errorInfo={selectedAgentData.errorInfo}
      />

      {/* Progress Bar */}
      <ProgressBar
        progress={displayData.progress}
        stage={displayData.stage}
      />

      {/* CRP Modal (when human input needed) */}
      {showingCRP && effectiveCRP && (
        <CRPPrompt
          crp={effectiveCRP}
          crpId={currentCRP?.crp_id}
          onSubmit={handleCRPSubmit}
          onCancel={handleCRPCancel}
          submitting={crpSubmitting}
        />
      )}

      {/* Rerun status message */}
      {rerunMessage && (
        <Box paddingX={1}>
          <Text color={rerunMessage.type === 'success' ? 'green' : 'red'}>
            {rerunMessage.text}
          </Text>
        </Box>
      )}

      {/* Footer: Key bindings */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          [1-4] Agent  [n] New  [l] List  [m] MRP  [s] Stop  [r] Rerun  [d] Detach  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
