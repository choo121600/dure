/**
 * useDashboardData - React hook for subscribing to DashboardDataProvider
 *
 * Provides real-time dashboard data updates to TUI components.
 */
import { useState, useEffect, useCallback } from 'react';
import type { DashboardData, AgentName } from '../../../types/index.js';
import type { DashboardDataProvider } from '../../../core/dashboard-data-provider.js';

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: Error | null;
  selectedAgent: AgentName;
  selectAgent: (agent: AgentName) => void;
}

/**
 * Create initial empty dashboard data
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
 * Hook to subscribe to dashboard data updates
 */
export function useDashboardData(provider: DashboardDataProvider | null): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('refiner');

  useEffect(() => {
    if (!provider) {
      setData(createEmptyData());
      setLoading(false);
      return;
    }

    // Handle updates
    const handleUpdate = (newData: DashboardData) => {
      setData(newData);
      setLoading(false);
      setError(null);
    };

    // Handle errors
    const handleError = (err: Error) => {
      setError(err);
    };

    // Handle stage changes - auto-select running agent
    const handleStageChange = ({ newStage }: { previousStage: string; newStage: string }) => {
      // Map stage to agent
      const stageToAgent: Record<string, AgentName> = {
        REFINE: 'refiner',
        BUILD: 'builder',
        VERIFY: 'verifier',
        GATE: 'gatekeeper',
      };
      const agent = stageToAgent[newStage];
      if (agent) {
        setSelectedAgent(agent);
      }
    };

    // Handle agent status changes - select newly running agent
    const handleAgentStatusChange = ({ agent, newStatus }: { agent: AgentName; previousStatus: string; newStatus: string }) => {
      if (newStatus === 'running') {
        setSelectedAgent(agent);
      }
    };

    // Subscribe to events
    provider.on('update', handleUpdate);
    provider.on('error', handleError);
    provider.on('stage-change', handleStageChange);
    provider.on('agent-status-change', handleAgentStatusChange);

    // Start polling
    provider.startPolling();

    // Cleanup
    return () => {
      provider.off('update', handleUpdate);
      provider.off('error', handleError);
      provider.off('stage-change', handleStageChange);
      provider.off('agent-status-change', handleAgentStatusChange);
      provider.stopPolling();
    };
  }, [provider]);

  const selectAgent = useCallback((agent: AgentName) => {
    setSelectedAgent(agent);
  }, []);

  return {
    data,
    loading,
    error,
    selectedAgent,
    selectAgent,
  };
}

/**
 * Hook for keyboard input handling
 */
export function useKeyboardShortcuts(
  selectAgent: (agent: AgentName) => void,
  onQuit: () => void,
  onDetach: () => void
): void {
  useEffect(() => {
    // ink handles keyboard input differently
    // This hook is for documentation purposes
    // Actual keyboard handling is done in the App component using useInput
  }, [selectAgent, onQuit, onDetach]);
}
