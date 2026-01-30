/**
 * EmptyState - Display when no active mission
 *
 * Shows guidance for creating or loading a mission.
 */
import React from 'react';
import { Box, Text } from 'ink';

export function EmptyState(): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingY={4}
    >
      <Box marginBottom={2}>
        <Text color="gray" dimColor>No active mission</Text>
      </Box>

      <Box flexDirection="column" alignItems="center">
        <Box marginBottom={1}>
          <Text>Press </Text>
          <Text color="cyan" bold>[n]</Text>
          <Text> to create a new mission</Text>
        </Box>
        <Box>
          <Text>Press </Text>
          <Text color="cyan" bold>[l]</Text>
          <Text> to load existing mission</Text>
        </Box>
      </Box>
    </Box>
  );
}

export default EmptyState;
