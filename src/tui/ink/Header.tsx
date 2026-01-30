/**
 * Header - Status summary component
 *
 * Shows run ID, current stage, tokens, cost, and retry count.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { DashboardData } from '../../types/index.js';

interface HeaderProps {
  data: DashboardData;
}

/**
 * Format cost as USD string
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Format token count with commas
 */
function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/**
 * Get stage display color
 */
function getStageColor(stage: DashboardData['stage']): string {
  switch (stage) {
    case 'REFINE':
      return 'cyan';
    case 'BUILD':
      return 'yellow';
    case 'VERIFY':
      return 'magenta';
    case 'GATE':
      return 'blue';
    case 'DONE':
      return 'green';
    case 'FAILED':
      return 'red';
    case 'WAITING_HUMAN':
      return 'yellow';
    default:
      return 'white';
  }
}

export function Header({ data }: HeaderProps): React.ReactElement {
  const stageColor = getStageColor(data.stage);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="blue">Dure</Text>
        <Text dimColor>Press 'q' to quit, 'd' to detach</Text>
      </Box>
      <Box marginTop={1}>
        <Box width="50%">
          <Text>Run: </Text>
          <Text color="cyan">{data.runId || 'N/A'}</Text>
        </Box>
        <Box width="50%">
          <Text>Stage: </Text>
          <Text color={stageColor} bold>{data.stage}</Text>
        </Box>
      </Box>
      <Box>
        <Box width="33%">
          <Text>Tokens: </Text>
          <Text color="green">{formatTokens(data.usage.totalTokens)}</Text>
        </Box>
        <Box width="33%">
          <Text>Cost: </Text>
          <Text color="yellow">{formatCost(data.usage.cost)}</Text>
        </Box>
        <Box width="34%">
          <Text>Retry: </Text>
          <Text color={data.progress.retryCount > 0 ? 'red' : 'white'}>
            {data.progress.retryCount}/{data.progress.maxIterations}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
