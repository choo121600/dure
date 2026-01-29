/**
 * OutputView - Active agent output display
 *
 * Shows the most recent output from the selected agent.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { AgentName } from '../../types/index.js';

interface OutputViewProps {
  agent: AgentName;
  output: string;
  maxLines?: number;
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

export function OutputView({ agent, output, maxLines = 15 }: OutputViewProps): React.ReactElement {
  const lines = useMemo(() => processOutput(output, maxLines), [output, maxLines]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      flexGrow={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Output ({AGENT_LABELS[agent]})</Text>
      </Box>
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
