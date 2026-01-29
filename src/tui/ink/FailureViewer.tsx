/**
 * FailureViewer - Display failure details when a run fails
 *
 * Shows the Gatekeeper verdict, issues, and suggested next steps
 * to help users understand and fix the problem.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { GatekeeperVerdict } from '../../types/index.js';

interface FailureViewerProps {
  verdict: GatekeeperVerdict | null;
  runId: string;
  onClose: () => void;
}

const LINES_PER_PAGE = 12;

function getIssueSeverityColor(issue: string): string {
  if (issue.startsWith('CRITICAL:')) return 'red';
  if (issue.startsWith('HIGH:')) return 'redBright';
  if (issue.startsWith('MEDIUM:')) return 'yellow';
  if (issue.startsWith('LOW:')) return 'cyan';
  if (issue.startsWith('INFO:')) return 'gray';
  return 'white';
}

function getNextSteps(verdict: GatekeeperVerdict): string[] {
  const steps: string[] = [];

  if (verdict.issues) {
    const hasCritical = verdict.issues.some(i => i.startsWith('CRITICAL:'));
    const hasTypeError = verdict.issues.some(i => i.includes('TypeScript') || i.includes('typecheck'));
    const hasTestFailure = verdict.issues.some(i => i.includes('test') || i.includes('Test'));

    if (hasTypeError) {
      steps.push('Run: npm run typecheck');
      steps.push('Fix TypeScript errors in the reported files');
    }

    if (hasTestFailure) {
      steps.push('Run: npm test');
      steps.push('Fix failing tests');
    }

    if (hasCritical) {
      steps.push('Address CRITICAL issues first');
    }
  }

  steps.push('Re-run: dure run');

  return steps;
}

export function FailureViewer({
  verdict,
  runId,
  onClose,
}: FailureViewerProps): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    if (key.upArrow || input === 'k') {
      setScrollOffset(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setScrollOffset(prev => prev + 1);
      return;
    }
  });

  if (!verdict) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
          <Text color="red" bold>Run Failed</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>No verdict information available.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press ESC or 'q' to close</Text>
        </Box>
      </Box>
    );
  }

  const issues = verdict.issues || [];
  const nextSteps = getNextSteps(verdict);

  // Build content lines
  const lines: { text: string; color?: string; bold?: boolean }[] = [];

  // Header
  lines.push({ text: `Run: ${runId}`, color: 'gray' });
  lines.push({ text: '' });

  // Verdict
  lines.push({ text: `Verdict: ${verdict.verdict}`, color: 'red', bold: true });
  lines.push({ text: '' });

  // Reason
  lines.push({ text: 'Reason:', color: 'cyan', bold: true });
  lines.push({ text: verdict.reason });
  lines.push({ text: '' });

  // Issues
  if (issues.length > 0) {
    lines.push({ text: `Issues (${issues.length}):`, color: 'cyan', bold: true });
    for (const issue of issues) {
      lines.push({ text: `  ${issue}`, color: getIssueSeverityColor(issue) });
    }
    lines.push({ text: '' });
  }

  // Test info
  if (verdict.tests_passing !== undefined) {
    lines.push({ text: 'Test Status:', color: 'cyan', bold: true });
    lines.push({
      text: `  Tests Passing: ${verdict.tests_passing ? 'Yes' : 'No'}`,
      color: verdict.tests_passing ? 'green' : 'red',
    });
    if (verdict.details) {
      lines.push({ text: `  Total: ${verdict.details.tests_total || 0}` });
      lines.push({ text: `  Passed: ${verdict.details.tests_passed || 0}`, color: 'green' });
      lines.push({ text: `  Failed: ${verdict.details.tests_failed || 0}`, color: verdict.details.tests_failed ? 'red' : 'white' });
    }
    lines.push({ text: '' });
  }

  // Next steps
  lines.push({ text: 'Next Steps:', color: 'green', bold: true });
  for (let i = 0; i < nextSteps.length; i++) {
    lines.push({ text: `  ${i + 1}. ${nextSteps[i]}` });
  }

  // Apply scroll
  const visibleLines = lines.slice(scrollOffset, scrollOffset + LINES_PER_PAGE);
  const hasMore = scrollOffset + LINES_PER_PAGE < lines.length;
  const hasLess = scrollOffset > 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Title */}
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={0} marginBottom={1}>
        <Text color="red" bold> Run Failed </Text>
      </Box>

      {/* Scroll indicator (top) */}
      {hasLess && (
        <Box paddingX={1}>
          <Text dimColor>--- scroll up (k/arrow) ---</Text>
        </Box>
      )}

      {/* Content */}
      <Box flexDirection="column" paddingX={1} height={LINES_PER_PAGE}>
        {visibleLines.map((line, idx) => (
          <Text key={idx} color={line.color as any} bold={line.bold}>
            {line.text}
          </Text>
        ))}
      </Box>

      {/* Scroll indicator (bottom) */}
      {hasMore && (
        <Box paddingX={1}>
          <Text dimColor>--- scroll down (j/arrow) ---</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>Press ESC or 'q' to close</Text>
      </Box>
    </Box>
  );
}
