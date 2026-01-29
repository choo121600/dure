/**
 * RunListScreen - Run selection list
 *
 * Displays all runs and allows user to select one for monitoring.
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RunListItem, Phase } from '../../types/index.js';

interface RunListScreenProps {
  runs: RunListItem[];
  onSelect: (runId: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const PHASE_COLORS: Record<Phase, string> = {
  refine: 'blue',
  build: 'yellow',
  verify: 'cyan',
  gate: 'magenta',
  waiting_human: 'red',
  ready_for_merge: 'green',
  completed: 'green',
  failed: 'red',
};

const PHASE_LABELS: Record<Phase, string> = {
  refine: 'REFINE',
  build: 'BUILD',
  verify: 'VERIFY',
  gate: 'GATE',
  waiting_human: 'WAITING',
  ready_for_merge: 'READY',
  completed: 'DONE',
  failed: 'FAILED',
};

function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}

export function RunListScreen({
  runs,
  onSelect,
  onCancel,
  loading = false,
}: RunListScreenProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Clamp selected index when runs change
  useEffect(() => {
    if (runs.length > 0 && selectedIndex >= runs.length) {
      setSelectedIndex(runs.length - 1);
    }
  }, [runs.length, selectedIndex]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (runs.length === 0) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(runs.length - 1, prev + 1));
    } else if (key.return) {
      if (runs[selectedIndex]) {
        onSelect(runs[selectedIndex].run_id);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="blue">Select Run</Text>
        <Text dimColor> ({runs.length} runs)</Text>
      </Box>

      {loading ? (
        <Box>
          <Text color="blue">Loading runs...</Text>
        </Box>
      ) : runs.length === 0 ? (
        <Box>
          <Text dimColor>No runs found. Press 'n' to create a new run.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {runs.slice(0, 10).map((run, index) => {
            const isSelected = index === selectedIndex;
            const phaseColor = PHASE_COLORS[run.phase] || 'white';
            const phaseLabel = PHASE_LABELS[run.phase] || run.phase.toUpperCase();

            return (
              <Box key={run.run_id} gap={1}>
                <Text color={isSelected ? 'cyan' : 'gray'}>
                  {isSelected ? '>' : ' '}
                </Text>
                <Text
                  color={isSelected ? 'cyan' : 'white'}
                  bold={isSelected}
                >
                  {run.run_id}
                </Text>
                <Text color={phaseColor}>[{phaseLabel}]</Text>
                <Text dimColor>iter:{run.iteration}</Text>
                <Text dimColor>{formatTime(run.updated_at)}</Text>
              </Box>
            );
          })}
          {runs.length > 10 && (
            <Box marginTop={1}>
              <Text dimColor>... and {runs.length - 10} more</Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          {'\u2191/\u2193'} or j/k: Navigate | Enter: Select | Esc: Cancel
        </Text>
      </Box>
    </Box>
  );
}
