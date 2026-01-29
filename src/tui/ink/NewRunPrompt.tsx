/**
 * NewRunPrompt - Briefing input for new run
 *
 * Modal component for entering briefing text to start a new run.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface NewRunPromptProps {
  onSubmit: (briefing: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

export function NewRunPrompt({
  onSubmit,
  onCancel,
  loading = false,
  error = null,
}: NewRunPromptProps): React.ReactElement {
  const [briefing, setBriefing] = useState('');

  useInput((input, key) => {
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
        <Text bold color="green">New Run</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Enter your briefing (what should be built):</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Box>
          <Text color="blue">Starting run...</Text>
        </Box>
      ) : (
        <Box>
          <Text color="cyan">&gt; </Text>
          <TextInput
            value={briefing}
            onChange={setBriefing}
            onSubmit={handleSubmit}
            placeholder="Describe what you want to build..."
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
