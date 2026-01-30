/**
 * HistoryView - History tab content
 *
 * Displays past runs with mission associations.
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RunListItem, Phase } from '../../../types/index.js';

interface HistoryViewProps {
  runs: RunListItem[];
  onSelectRun?: (runId: string) => void;
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

export function HistoryView({
  runs,
  onSelectRun,
  loading = false,
}: HistoryViewProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Clamp selected index when runs change
  useEffect(() => {
    if (runs.length > 0 && selectedIndex >= runs.length) {
      setSelectedIndex(runs.length - 1);
    }
  }, [runs.length, selectedIndex]);

  useInput((input, key) => {
    if (runs.length === 0) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(runs.length - 1, prev + 1));
    } else if (key.return) {
      if (runs[selectedIndex] && onSelectRun) {
        onSelectRun(runs[selectedIndex].run_id);
      }
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Loading history...</Text>
      </Box>
    );
  }

  // Empty state
  if (runs.length === 0) {
    return (
      <Box flexDirection="column" padding={1} alignItems="center">
        <Text dimColor>No runs found</Text>
        <Box marginTop={1}>
          <Text>Create a mission and run a task to see history</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">Run History</Text>
        <Text dimColor> ({runs.length} runs)</Text>
      </Box>

      {/* Run list */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        {runs.slice(0, 15).map((run, index) => {
          const isSelected = index === selectedIndex;
          const phaseColor = PHASE_COLORS[run.phase] || 'white';
          const phaseLabel = PHASE_LABELS[run.phase] || run.phase.toUpperCase();

          return (
            <Box key={run.run_id} gap={1}>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '>' : ' '}
              </Text>
              <Box width={26}>
                <Text
                  color={isSelected ? 'cyan' : 'white'}
                  bold={isSelected}
                >
                  {run.run_id}
                </Text>
              </Box>
              <Box width={12}>
                <Text color={phaseColor}>[{phaseLabel}]</Text>
              </Box>
              <Box width={10}>
                <Text dimColor>iter:{run.iteration}</Text>
              </Box>
              <Text dimColor>{formatTime(run.updated_at)}</Text>
            </Box>
          );
        })}
        {runs.length > 15 && (
          <Box marginTop={1}>
            <Text dimColor>... and {runs.length - 15} more</Text>
          </Box>
        )}
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>
          [j/k] Navigate  [Enter] View Run Details
        </Text>
      </Box>
    </Box>
  );
}

export default HistoryView;
