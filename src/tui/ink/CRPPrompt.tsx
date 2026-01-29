/**
 * CRPPrompt - Human judgment input UI
 *
 * Displays when human input is required (CRP - Consultation Request Pack).
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DashboardCRP, AgentName } from '../../types/index.js';

interface CRPPromptProps {
  crp: DashboardCRP;
  onSubmit: (selectedOption: number, customResponse?: string) => void;
  onCancel: () => void;
}

const AGENT_LABELS: Record<AgentName, string> = {
  refiner: 'Refiner',
  builder: 'Builder',
  verifier: 'Verifier',
  gatekeeper: 'Gatekeeper',
};

export function CRPPrompt({ crp, onSubmit, onCancel }: CRPPromptProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(crp.options.length - 1, prev + 1));
    } else if (key.return) {
      onSubmit(selectedIndex);
    } else if (key.escape || input === 'q') {
      onCancel();
    } else if (input >= '1' && input <= '9') {
      const index = parseInt(input, 10) - 1;
      if (index < crp.options.length) {
        setSelectedIndex(index);
        onSubmit(index);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="yellow">Human Input Required</Text>
        <Text dimColor> (from {AGENT_LABELS[crp.agent]})</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold>{crp.question}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {crp.options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={index} gap={1}>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '>' : ' '} [{index + 1}]
              </Text>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {option}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑/↓ or j/k: Navigate | Enter or 1-9: Select | Esc: Cancel
        </Text>
      </Box>
    </Box>
  );
}
