/**
 * mission kanban Command
 *
 * Display mission kanban board in TUI.
 */
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import type { MissionId } from '../../types/branded.js';

// ============================================================================
// Types
// ============================================================================

interface MissionKanbanOptions {
  watch?: boolean;
}

// ============================================================================
// Command Handler
// ============================================================================

export async function missionKanbanCommand(
  missionId: string,
  options: MissionKanbanOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Validate mission exists
  const missionDir = join(projectRoot, '.dure', 'missions', missionId);
  const kanbanPath = join(missionDir, 'kanban.json');

  if (!existsSync(missionDir)) {
    console.error(chalk.red(`Mission not found: ${missionId}`));
    console.error(chalk.gray(`Expected at: ${missionDir}`));
    process.exit(1);
  }

  if (!existsSync(kanbanPath)) {
    console.error(chalk.red(`Kanban state not found for mission: ${missionId}`));
    console.error(chalk.gray('Run "dure mission run" first to initialize kanban state.'));
    process.exit(1);
  }

  // Dynamic import to avoid loading React when not needed
  const { MissionKanbanScreen } = await import('../../tui/ink/screens/MissionKanbanScreen.js');

  // Render TUI
  const { waitUntilExit } = render(
    React.createElement(MissionKanbanScreen, {
      projectRoot,
      missionId: missionId as MissionId,
      watch: options.watch,
    })
  );

  await waitUntilExit();
}
