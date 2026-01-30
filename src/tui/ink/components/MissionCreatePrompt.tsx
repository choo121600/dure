/**
 * MissionCreatePrompt - Mission description input
 *
 * Modal component for entering description text to create a new mission.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface MissionCreatePromptProps {
  onSubmit: (description: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

export function MissionCreatePrompt({
  onSubmit,
  onCancel,
  loading = false,
  error = null,
}: MissionCreatePromptProps): React.ReactElement {
  const [description, setDescription] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="green"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="green">New Mission</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Describe what you want to accomplish:</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Box>
          <Text color="blue">Creating mission and running planning...</Text>
        </Box>
      ) : (
        <Box>
          <Text color="cyan">&gt; </Text>
          <TextInput
            value={description}
            onChange={setDescription}
            onSubmit={handleSubmit}
            placeholder="Enter a multi-step goal for the agents to accomplish..."
          />
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          Enter: Submit | Esc: Cancel
        </Text>
      </Box>
    </Box>
  );
}

export default MissionCreatePrompt;
