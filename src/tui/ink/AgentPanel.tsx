/**
 * AgentPanel - Agent status display component
 *
 * Shows the status of all four agents in a horizontal layout.
 */
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentName, DashboardAgentStatus } from '../../types/index.js';

interface AgentInfo {
  name: AgentName;
  status: DashboardAgentStatus;
}

interface AgentPanelProps {
  agents: Record<AgentName, { status: DashboardAgentStatus }>;
  selectedAgent: AgentName;
  onSelectAgent: (agent: AgentName) => void;
}

const AGENT_ORDER: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
const AGENT_LABELS: Record<AgentName, string> = {
  refiner: 'Refiner',
  builder: 'Builder',
  verifier: 'Verifier',
  gatekeeper: 'Gatekeeper',
};

/**
 * Get status indicator
 */
function getStatusIndicator(status: DashboardAgentStatus): React.ReactElement {
  switch (status) {
    case 'idle':
      return <Text color="gray">○</Text>;
    case 'running':
      return <Text color="green"><Spinner type="dots" /></Text>;
    case 'done':
      return <Text color="green">✓</Text>;
    case 'error':
      return <Text color="red">✗</Text>;
    default:
      return <Text color="gray">○</Text>;
  }
}

/**
 * Get agent color based on status and selection
 */
function getAgentColor(status: DashboardAgentStatus, isSelected: boolean): string {
  if (isSelected) {
    return 'cyan';
  }
  switch (status) {
    case 'running':
      return 'green';
    case 'done':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

export function AgentPanel({ agents, selectedAgent, onSelectAgent }: AgentPanelProps): React.ReactElement {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="gray">Agents</Text>
      <Box gap={2}>
        {AGENT_ORDER.map((agent, index) => {
          const { status } = agents[agent];
          const isSelected = selectedAgent === agent;
          const color = getAgentColor(status, isSelected);

          return (
            <Box key={agent} gap={1}>
              <Text color="gray">[{index + 1}]</Text>
              {getStatusIndicator(status)}
              <Text
                color={color}
                bold={isSelected}
                underline={isSelected}
              >
                {AGENT_LABELS[agent]}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
