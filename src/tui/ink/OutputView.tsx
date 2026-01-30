/**
 * OutputView - Active agent output display
 *
 * Shows the most recent output from the selected agent.
 * Displays error information when agent has failed.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { AgentName, DashboardErrorInfo } from '../../types/index.js';

interface OutputViewProps {
  agent: AgentName;
  output: string;
  maxLines?: number;
  errorInfo?: DashboardErrorInfo;
}

const AGENT_LABELS: Record<AgentName, string> = {
  refiner: 'Refiner',
  builder: 'Builder',
  verifier: 'Verifier',
  gatekeeper: 'Gatekeeper',
};

/**
 * Process output to fit in the terminal
 */
function processOutput(output: string, maxLines: number): string[] {
  if (!output) {
    return ['(No output yet)'];
  }

  // Split by newlines and get the last N lines
  const lines = output.split('\n');
  const relevantLines = lines.slice(-maxLines);

  // Filter out empty lines at the end
  while (relevantLines.length > 0 && relevantLines[relevantLines.length - 1].trim() === '') {
    relevantLines.pop();
  }

  if (relevantLines.length === 0) {
    return ['(No output yet)'];
  }

  return relevantLines;
}

/**
 * Error info panel component
 */
function ErrorInfoPanel({ errorInfo }: { errorInfo: DashboardErrorInfo }): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="red"
      paddingX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text bold color="red">Error Details</Text>
      </Box>
      <Box flexDirection="column">
        <Text>
          <Text color="red" bold>Type: </Text>
          <Text>{errorInfo.error_type}</Text>
        </Text>
        <Text>
          <Text color="red" bold>Message: </Text>
          <Text>{errorInfo.message}</Text>
        </Text>
        {errorInfo.stack && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red" bold>Stack:</Text>
            <Text dimColor wrap="truncate">{errorInfo.stack.split('\n').slice(0, 3).join('\n')}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text>
            <Text color="red" bold>Recoverable: </Text>
            <Text color={errorInfo.recoverable ? 'green' : 'red'}>
              {errorInfo.recoverable ? 'Yes' : 'No'}
            </Text>
          </Text>
        </Box>
        <Text dimColor>
          {new Date(errorInfo.timestamp).toLocaleString()}
        </Text>
      </Box>
    </Box>
  );
}

export function OutputView({ agent, output, maxLines = 15, errorInfo }: OutputViewProps): React.ReactElement {
  const lines = useMemo(() => processOutput(output, maxLines), [output, maxLines]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={errorInfo ? 'red' : 'cyan'}
      paddingX={1}
      flexGrow={1}
    >
      <Box marginBottom={1}>
        <Text bold color={errorInfo ? 'red' : 'cyan'}>
          Output ({AGENT_LABELS[agent]}){errorInfo ? ' - ERROR' : ''}
        </Text>
      </Box>

      {/* Show error panel if error info is available */}
      {errorInfo && <ErrorInfoPanel errorInfo={errorInfo} />}

      <Box flexDirection="column" flexGrow={1}>
        {lines.map((line, index) => (
          <Text key={index} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
