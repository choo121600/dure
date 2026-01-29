/**
 * MRPViewer - Merge-Readiness Pack viewer
 *
 * Displays test results, changed files, and metrics for completed runs.
 */
import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MRPEvidence } from '../../types/index.js';

interface MRPViewerProps {
  evidence: MRPEvidence | null;
  onClose: () => void;
  loading?: boolean;
}

const LINES_PER_PAGE = 15;

export function MRPViewer({
  evidence,
  onClose,
  loading = false,
}: MRPViewerProps): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Build content lines
  const contentLines = useMemo(() => {
    if (!evidence) return [];

    const lines: Array<{ text: string; color?: string; bold?: boolean }> = [];

    // Header
    lines.push({ text: '=== Merge-Readiness Pack ===', color: 'green', bold: true });
    lines.push({ text: '' });

    // Verdict
    const verdictColor = evidence.verdict === 'PASS' ? 'green' : evidence.verdict === 'FAIL' ? 'red' : 'yellow';
    lines.push({ text: `Verdict: ${evidence.verdict || 'N/A'}`, color: verdictColor, bold: true });
    lines.push({ text: `Ready for Merge: ${evidence.ready_for_merge ? 'Yes' : 'No'}`, color: evidence.ready_for_merge ? 'green' : 'red' });
    lines.push({ text: '' });

    // Test Results
    lines.push({ text: '--- Test Results ---', color: 'cyan', bold: true });
    lines.push({ text: `Total: ${evidence.tests.total}` });
    lines.push({ text: `Passed: ${evidence.tests.passed}`, color: 'green' });
    lines.push({ text: `Failed: ${evidence.tests.failed}`, color: evidence.tests.failed > 0 ? 'red' : 'white' });
    if (evidence.tests.coverage !== undefined) {
      lines.push({ text: `Coverage: ${evidence.tests.coverage}%` });
    }
    lines.push({ text: '' });

    // Files Changed
    lines.push({ text: '--- Files Changed ---', color: 'cyan', bold: true });
    if (evidence.files_changed.length === 0) {
      lines.push({ text: '(none)', color: 'gray' });
    } else {
      for (const file of evidence.files_changed.slice(0, 10)) {
        lines.push({ text: `  M ${file}`, color: 'yellow' });
      }
      if (evidence.files_changed.length > 10) {
        lines.push({ text: `  ... and ${evidence.files_changed.length - 10} more`, color: 'gray' });
      }
    }
    lines.push({ text: '' });

    // Files Created
    if (evidence.files_created && evidence.files_created.length > 0) {
      lines.push({ text: '--- Files Created ---', color: 'cyan', bold: true });
      for (const file of evidence.files_created.slice(0, 10)) {
        lines.push({ text: `  A ${file}`, color: 'green' });
      }
      if (evidence.files_created.length > 10) {
        lines.push({ text: `  ... and ${evidence.files_created.length - 10} more`, color: 'gray' });
      }
      lines.push({ text: '' });
    }

    // Metrics
    lines.push({ text: '--- Metrics ---', color: 'cyan', bold: true });
    lines.push({ text: `Iterations: ${evidence.iterations}/${evidence.max_iterations || 'N/A'}` });
    if (evidence.lines_added !== undefined) {
      lines.push({ text: `Lines Added: +${evidence.lines_added}`, color: 'green' });
    }
    if (evidence.lines_deleted !== undefined) {
      lines.push({ text: `Lines Deleted: -${evidence.lines_deleted}`, color: 'red' });
    }
    if (evidence.net_change !== undefined) {
      const netColor = evidence.net_change >= 0 ? 'green' : 'red';
      lines.push({ text: `Net Change: ${evidence.net_change >= 0 ? '+' : ''}${evidence.net_change}`, color: netColor });
    }
    lines.push({ text: '' });

    // Usage
    if (evidence.usage) {
      lines.push({ text: '--- Usage ---', color: 'cyan', bold: true });
      lines.push({ text: `Total Cost: $${evidence.usage.total.total_cost_usd.toFixed(4)}` });
      lines.push({ text: `Input Tokens: ${evidence.usage.total.total_input_tokens.toLocaleString()}` });
      lines.push({ text: `Output Tokens: ${evidence.usage.total.total_output_tokens.toLocaleString()}` });
      lines.push({ text: '' });
    }

    // Decisions
    if (evidence.decisions && evidence.decisions.length > 0) {
      lines.push({ text: '--- Human Decisions ---', color: 'cyan', bold: true });
      for (const decision of evidence.decisions) {
        lines.push({ text: `  - ${decision}` });
      }
      lines.push({ text: '' });
    }

    // Edge cases tested
    if (evidence.edge_cases_tested && evidence.edge_cases_tested.length > 0) {
      lines.push({ text: '--- Edge Cases Tested ---', color: 'cyan', bold: true });
      for (const edgeCase of evidence.edge_cases_tested.slice(0, 5)) {
        lines.push({ text: `  - ${edgeCase}` });
      }
      if (evidence.edge_cases_tested.length > 5) {
        lines.push({ text: `  ... and ${evidence.edge_cases_tested.length - 5} more`, color: 'gray' });
      }
      lines.push({ text: '' });
    }

    // Adversarial findings
    if (evidence.adversarial_findings && evidence.adversarial_findings.length > 0) {
      lines.push({ text: '--- Adversarial Findings ---', color: 'red', bold: true });
      for (const finding of evidence.adversarial_findings) {
        lines.push({ text: `  ! ${finding}`, color: 'red' });
      }
      lines.push({ text: '' });
    }

    return lines;
  }, [evidence]);

  const maxScroll = Math.max(0, contentLines.length - LINES_PER_PAGE);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow || input === 'k') {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - LINES_PER_PAGE));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.min(maxScroll, prev + LINES_PER_PAGE));
    }
  });

  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + LINES_PER_PAGE);
  const showScrollIndicator = contentLines.length > LINES_PER_PAGE;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="green"
      paddingX={2}
      paddingY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">MRP Viewer</Text>
        {showScrollIndicator && (
          <Text dimColor>
            [{scrollOffset + 1}-{Math.min(scrollOffset + LINES_PER_PAGE, contentLines.length)}/{contentLines.length}]
          </Text>
        )}
      </Box>

      {loading ? (
        <Box>
          <Text color="blue">Loading MRP data...</Text>
        </Box>
      ) : !evidence ? (
        <Box>
          <Text dimColor>No MRP data available. Run must complete with PASS verdict.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" height={LINES_PER_PAGE}>
          {visibleLines.map((line, index) => (
            <Text
              key={scrollOffset + index}
              color={line.color as Parameters<typeof Text>[0]['color']}
              bold={line.bold}
            >
              {line.text || ' '}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          {'\u2191/\u2193'} or j/k: Scroll | PgUp/PgDn: Page | Esc: Close
        </Text>
      </Box>
    </Box>
  );
}
