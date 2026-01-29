/**
 * App - Main TUI component
 *
 * Orchestrates all TUI components and handles keyboard input.
 */
import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './Header.js';
import { AgentPanel } from './AgentPanel.js';
import { OutputView } from './OutputView.js';
import { ProgressBar } from './ProgressBar.js';
import { CRPPrompt } from './CRPPrompt.js';
import { useDashboardData } from './hooks/useDashboardData.js';
import type { AgentName, DashboardData } from '../../types/index.js';
import type { DashboardDataProvider } from '../../core/dashboard-data-provider.js';

interface AppProps {
  provider: DashboardDataProvider | null;
  onDetach?: () => void;
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

export function App({ provider, onDetach }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { data, loading, error, selectedAgent, selectAgent } = useDashboardData(provider);
  const [showingCRP, setShowingCRP] = useState(false);

  // Handle keyboard input
  useInput((input, key) => {
    // Number keys 1-4 to select agents
    if (input >= '1' && input <= '4') {
      const index = parseInt(input, 10) - 1;
      if (index < AGENT_ORDER.length) {
        selectAgent(AGENT_ORDER[index]);
      }
      return;
    }

    // 'q' to quit
    if (input === 'q' && !showingCRP) {
      exit();
      return;
    }

    // 'd' to detach
    if (input === 'd' && !showingCRP) {
      onDetach?.();
      exit();
      return;
    }

    // Escape to close CRP modal
    if (key.escape && showingCRP) {
      setShowingCRP(false);
      return;
    }
  });

  // Handle CRP submit
  const handleCRPSubmit = useCallback((selectedOption: number, _customResponse?: string) => {
    // TODO: Send VCR response via API or file
    console.log(`Selected option: ${selectedOption}`);
    setShowingCRP(false);
  }, []);

  // Handle CRP cancel
  const handleCRPCancel = useCallback(() => {
    setShowingCRP(false);
  }, []);

  // Show CRP modal when CRP is available
  React.useEffect(() => {
    if (data?.crp && !showingCRP) {
      setShowingCRP(true);
    }
  }, [data?.crp, showingCRP]);

  // Use actual data or empty data
  const displayData = data ?? createEmptyData();

  // Loading state
  if (loading && !data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue" bold>Dure</Text>
        <Text>Loading dashboard data...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error</Text>
        <Text color="red">{error.message}</Text>
        <Text dimColor>Press 'q' to quit</Text>
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
          onSubmit={handleCRPSubmit}
          onCancel={handleCRPCancel}
        />
      )}

      {/* Footer: Key bindings */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          [1-4] Switch agent  [q] Quit  [d] Detach
        </Text>
      </Box>
    </Box>
  );
}
