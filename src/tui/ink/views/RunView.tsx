/**
 * RunView - Run tab content (4-agent dashboard)
 *
 * Displays the 4-agent execution dashboard with optional task context header.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AgentPanel } from '../AgentPanel.js';
import { OutputView } from '../OutputView.js';
import { ProgressBar } from '../ProgressBar.js';
import { CRPPrompt } from '../CRPPrompt.js';
import { useDashboardData } from '../hooks/useDashboardData.js';
import type {
  AgentName,
  DashboardData,
  DashboardCRP,
  VCR,
  CRP,
  TaskId,
} from '../../../types/index.js';
import type { DashboardDataProvider } from '../../../core/dashboard-data-provider.js';

interface TaskContext {
  taskId: TaskId;
  taskTitle: string;
  phaseNumber: number;
}

interface RunViewProps {
  provider: DashboardDataProvider | null;
  taskContext?: TaskContext | null;
  currentCRP?: CRP | null;
  onSubmitVCR?: (vcr: VCR) => Promise<void>;
  onStopRun?: () => Promise<void>;
  onRerunAgent?: (agent: AgentName) => Promise<void>;
}

const AGENT_ORDER: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

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

export function RunView({
  provider,
  taskContext,
  currentCRP,
  onSubmitVCR,
  onStopRun,
  onRerunAgent,
}: RunViewProps): React.ReactElement {
  const { data, loading, error, selectedAgent, selectAgent } = useDashboardData(provider);

  // CRP modal state
  const [showingCRP, setShowingCRP] = useState(false);
  const [crpSubmitting, setCrpSubmitting] = useState(false);

  // Rerun state
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunMessage, setRerunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Effective CRP (from polling or prop)
  const effectiveCRP = data?.crp || (currentCRP?.status === 'pending' ? crpToDashboardCRP(currentCRP) : null);

  // Handle keyboard input
  useInput((input, key) => {
    // CRP modal takes priority
    if (showingCRP) {
      if (key.escape) {
        setShowingCRP(false);
      }
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
      setTimeout(() => setRerunMessage(null), 2000);
    } catch (err) {
      setRerunMessage({
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to rerun ${selectedAgent}`,
      });
      setTimeout(() => setRerunMessage(null), 5000);
    } finally {
      setRerunLoading(false);
    }
  }, [onRerunAgent, selectedAgent, data, rerunLoading]);

  // Show CRP modal when CRP is available
  useEffect(() => {
    if (effectiveCRP && !showingCRP) {
      setShowingCRP(true);
    }
  }, [effectiveCRP, showingCRP]);

  // Use actual data or empty data
  const displayData = data ?? createEmptyData();

  // Loading state
  if (loading && !data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Loading run data...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error</Text>
        <Text color="red">{error.message}</Text>
      </Box>
    );
  }

  // No run active
  if (!displayData.runId) {
    return (
      <Box flexDirection="column" padding={1} alignItems="center">
        <Text dimColor>No run active</Text>
        <Box marginTop={1}>
          <Text>Select a task in Kanban tab and press </Text>
          <Text color="cyan" bold>Enter</Text>
          <Text> to start a run</Text>
        </Box>
      </Box>
    );
  }

  // Get selected agent's output
  const selectedAgentData = displayData.agents[selectedAgent];

  return (
    <Box flexDirection="column" width="100%">
      {/* Task context header (when running from mission) */}
      {taskContext && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1} marginBottom={1}>
          <Text color="yellow" bold>Task: </Text>
          <Text>{taskContext.taskTitle}</Text>
          <Text dimColor> (Phase {taskContext.phaseNumber}, {taskContext.taskId})</Text>
        </Box>
      )}

      {/* Run info */}
      <Box paddingX={1} marginBottom={1}>
        <Text>Run: </Text>
        <Text color="cyan">{displayData.runId}</Text>
        <Text>  Stage: </Text>
        <Text color="yellow" bold>{displayData.stage}</Text>
        <Text>  Tokens: </Text>
        <Text color="green">{displayData.usage.totalTokens.toLocaleString()}</Text>
        <Text>  Cost: </Text>
        <Text color="yellow">${displayData.usage.cost.toFixed(4)}</Text>
      </Box>

      {/* Agent Panel */}
      <AgentPanel
        agents={displayData.agents}
        selectedAgent={selectedAgent}
        onSelectAgent={selectAgent}
      />

      {/* Output View */}
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

      {/* CRP Modal */}
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

      {/* Help */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          [1-4] Select Agent  [s] Stop  [r] Rerun
        </Text>
      </Box>
    </Box>
  );
}

export default RunView;
