/**
 * MissionListScreen - Mission selection list
 *
 * Displays all missions and allows user to select one for monitoring.
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Mission, MissionStatus } from '../../../types/mission.js';

interface MissionListScreenProps {
  missions: Mission[];
  onSelect: (missionId: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const STATUS_COLORS: Record<MissionStatus, string> = {
  planning: 'blue',
  plan_review: 'yellow',
  ready: 'cyan',
  in_progress: 'magenta',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
};

const STATUS_LABELS: Record<MissionStatus, string> = {
  planning: 'PLANNING',
  plan_review: 'REVIEW',
  ready: 'READY',
  in_progress: 'RUNNING',
  completed: 'DONE',
  failed: 'FAILED',
  cancelled: 'CANCEL',
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

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 2) + '..';
}

export function MissionListScreen({
  missions,
  onSelect,
  onCancel,
  loading = false,
}: MissionListScreenProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Clamp selected index when missions change
  useEffect(() => {
    if (missions.length > 0 && selectedIndex >= missions.length) {
      setSelectedIndex(missions.length - 1);
    }
  }, [missions.length, selectedIndex]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (missions.length === 0) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(missions.length - 1, prev + 1));
    } else if (key.return) {
      if (missions[selectedIndex]) {
        onSelect(missions[selectedIndex].mission_id);
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
        <Text bold color="blue">Select Mission</Text>
        <Text dimColor> ({missions.length} missions)</Text>
      </Box>

      {loading ? (
        <Box>
          <Text color="blue">Loading missions...</Text>
        </Box>
      ) : missions.length === 0 ? (
        <Box>
          <Text dimColor>No missions found. Press 'n' to create a new mission.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {missions.slice(0, 10).map((mission, index) => {
            const isSelected = index === selectedIndex;
            const statusColor = STATUS_COLORS[mission.status] || 'white';
            const statusLabel = STATUS_LABELS[mission.status] || mission.status.toUpperCase();

            return (
              <Box key={mission.mission_id} gap={1}>
                <Text color={isSelected ? 'cyan' : 'gray'}>
                  {isSelected ? '>' : ' '}
                </Text>
                <Box width={20}>
                  <Text
                    color={isSelected ? 'cyan' : 'white'}
                    bold={isSelected}
                  >
                    {truncate(mission.mission_id, 18)}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text color={statusColor}>[{statusLabel}]</Text>
                </Box>
                <Box width={12}>
                  <Text dimColor>
                    {mission.stats.completed_tasks}/{mission.stats.total_tasks} tasks
                  </Text>
                </Box>
                <Text dimColor>{formatTime(mission.updated_at)}</Text>
              </Box>
            );
          })}
          {missions.length > 10 && (
            <Box marginTop={1}>
              <Text dimColor>... and {missions.length - 10} more</Text>
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

export default MissionListScreen;
