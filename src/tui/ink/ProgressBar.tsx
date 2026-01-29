/**
 * ProgressBar - Pipeline progress display
 *
 * Shows the current progress through the 4-stage pipeline.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { DashboardProgress, DashboardStage } from '../../types/index.js';

interface ProgressBarProps {
  progress: DashboardProgress;
  stage: DashboardStage;
}

const STAGES = ['REFINE', 'BUILD', 'VERIFY', 'GATE'] as const;
const STAGE_COLORS: Record<string, string> = {
  REFINE: 'cyan',
  BUILD: 'yellow',
  VERIFY: 'magenta',
  GATE: 'blue',
};

/**
 * Calculate progress percentage
 */
function calculatePercentage(currentStep: number, totalSteps: number): number {
  if (totalSteps === 0) return 0;
  return Math.round((currentStep / totalSteps) * 100);
}

/**
 * Render progress bar
 */
function renderProgressBar(percentage: number, width: number = 30): React.ReactElement {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> {percentage}%</Text>
    </Box>
  );
}

export function ProgressBar({ progress, stage }: ProgressBarProps): React.ReactElement {
  const percentage = calculatePercentage(progress.currentStep, progress.totalSteps);
  const isComplete = stage === 'DONE';
  const isFailed = stage === 'FAILED';

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexDirection="column"
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="gray">Progress</Text>
        <Box gap={1}>
          {STAGES.map((s, index) => {
            const isPast = progress.currentStep > index + 1;
            const isCurrent = progress.currentStep === index + 1;
            const stageColor = STAGE_COLORS[s];

            return (
              <Box key={s} gap={1}>
                {index > 0 && <Text color="gray">→</Text>}
                <Text
                  color={isPast ? 'green' : isCurrent ? stageColor : 'gray'}
                  bold={isCurrent}
                  dimColor={!isPast && !isCurrent}
                >
                  {s}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box>
        {isComplete ? (
          <Text color="green" bold>✓ Complete</Text>
        ) : isFailed ? (
          <Text color="red" bold>✗ Failed</Text>
        ) : (
          renderProgressBar(percentage)
        )}
      </Box>
    </Box>
  );
}
