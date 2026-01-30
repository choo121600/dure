/**
 * TabHeader - Tab navigation header component
 *
 * Displays tab navigation (K/R/H) and mission context.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { TabMode, MissionId } from '../../../types/index.js';

interface TabHeaderProps {
  activeTab: TabMode;
  missionId?: MissionId | null;
  missionTitle?: string | null;
  currentPhase?: number;
}

interface TabItemProps {
  label: string;
  shortcut: string;
  isActive: boolean;
}

function TabItem({ label, shortcut, isActive }: TabItemProps): React.ReactElement {
  return (
    <Box marginRight={2}>
      <Text color={isActive ? 'cyan' : 'gray'} bold={isActive}>
        [{shortcut}] {label}
      </Text>
      {isActive && <Text color="cyan"> *</Text>}
    </Box>
  );
}

export function TabHeader({
  activeTab,
  missionId,
  missionTitle,
  currentPhase,
}: TabHeaderProps): React.ReactElement {
  // Format mission context for display
  const missionContext = missionId
    ? `${missionTitle || missionId}${currentPhase ? ` | Phase ${currentPhase}` : ''}`
    : 'No mission';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
    >
      {/* Top row: Title and mission context */}
      <Box justifyContent="space-between">
        <Text bold color="blue">Dure</Text>
        <Text dimColor>{missionContext}</Text>
      </Box>

      {/* Bottom row: Tab navigation */}
      <Box marginTop={1}>
        <TabItem
          label="Kanban"
          shortcut="K"
          isActive={activeTab === 'kanban'}
        />
        <TabItem
          label="Run"
          shortcut="R"
          isActive={activeTab === 'run'}
        />
        <TabItem
          label="History"
          shortcut="H"
          isActive={activeTab === 'history'}
        />
      </Box>
    </Box>
  );
}

export default TabHeader;
