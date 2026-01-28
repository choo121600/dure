#!/usr/bin/env tsx
/**
 * CLI Reference Documentation Generator
 *
 * Generates CLI_REFERENCE.md from SVG screenshots in docs/images/cli/
 *
 * Usage:
 *   tsx scripts/generate-cli-docs.ts           # Generate docs
 *   tsx scripts/generate-cli-docs.ts --verify  # Verify all screenshots are documented
 */

import fs from 'fs/promises';
import path from 'path';

const SCREENSHOTS_DIR = 'docs/images/cli';
const OUTPUT_FILE = 'docs/CLI_REFERENCE.md';
const DOCS_TO_CHECK = ['README.md', 'docs/CLI_REFERENCE.md'];

interface CommandInfo {
  name: string;
  displayName: string;
  screenshotPath: string;
  isSubcommand: boolean;
  parent?: string;
}

/**
 * Parse SVG filename to extract command info
 * Examples:
 *   output_.svg -> dure (root)
 *   output_start.svg -> dure start
 *   output_screenshots_generate.svg -> dure screenshots generate
 */
function parseFilename(filename: string): CommandInfo {
  const name = filename.replace('output_', '').replace('.svg', '');
  const parts = name.split('_').filter(Boolean);

  if (parts.length === 0) {
    return {
      name: '',
      displayName: 'dure',
      screenshotPath: `${SCREENSHOTS_DIR}/${filename}`,
      isSubcommand: false,
    };
  }

  if (parts.length === 1) {
    return {
      name: parts[0],
      displayName: `dure ${parts[0]}`,
      screenshotPath: `${SCREENSHOTS_DIR}/${filename}`,
      isSubcommand: false,
    };
  }

  return {
    name: parts.join('_'),
    displayName: `dure ${parts.join(' ')}`,
    screenshotPath: `${SCREENSHOTS_DIR}/${filename}`,
    isSubcommand: true,
    parent: parts[0],
  };
}

/**
 * Get description for each command
 */
function getCommandDescription(displayName: string): string {
  const descriptions: Record<string, string> = {
    dure: 'Dure CLI - Agentic Software Engineering with 4 cooperative AI agents.',
    'dure start': 'Start Dure in the current project directory.',
    'dure status': 'Show the status of the current run.',
    'dure stop': 'Stop the current run.',
    'dure history': 'Show the history of past runs.',
    'dure logs': 'Show real-time logs for the current run.',
    'dure delete': 'Delete a specific run by its ID.',
    'dure clean': 'Delete old completed or failed runs.',
    'dure clear-run': 'Terminate Claude processes in all agent panes.',
    'dure recover': 'Detect and recover interrupted runs.',
    'dure screenshots': 'CLI screenshot management for documentation.',
    'dure screenshots generate': 'Generate or update CLI screenshots.',
    'dure screenshots verify': 'Verify all screenshots are up to date.',
    'dure screenshots list': 'List all available commands and their screenshot status.',
  };

  return descriptions[displayName] || '';
}

/**
 * Generate CLI_REFERENCE.md content
 */
async function generateCliReference(commands: CommandInfo[]): Promise<string> {
  const now = new Date().toISOString().split('T')[0];

  let content = `# CLI Reference

> This document is auto-generated. Do not edit manually.
> Run \`npm run docs:cli\` to regenerate.
>
> Last generated: ${now}

Dure provides a command-line interface for managing agentic software engineering workflows.

## Table of Contents

`;

  // Generate TOC
  const rootCommand = commands.find((c) => c.name === '');
  const mainCommands = commands.filter((c) => !c.isSubcommand && c.name !== '');
  const subcommandGroups = new Map<string, CommandInfo[]>();

  for (const cmd of commands.filter((c) => c.isSubcommand)) {
    const existing = subcommandGroups.get(cmd.parent!) || [];
    existing.push(cmd);
    subcommandGroups.set(cmd.parent!, existing);
  }

  if (rootCommand) {
    content += `- [dure](#dure)\n`;
  }

  for (const cmd of mainCommands) {
    const anchor = cmd.displayName.replace(/\s+/g, '-').toLowerCase();
    content += `- [${cmd.displayName}](#${anchor})\n`;

    const subs = subcommandGroups.get(cmd.name);
    if (subs) {
      for (const sub of subs) {
        const subAnchor = sub.displayName.replace(/\s+/g, '-').toLowerCase();
        content += `  - [${sub.displayName}](#${subAnchor})\n`;
      }
    }
  }

  content += '\n---\n\n';

  // Generate command sections
  if (rootCommand) {
    content += generateCommandSection(rootCommand);
  }

  for (const cmd of mainCommands) {
    content += generateCommandSection(cmd);

    const subs = subcommandGroups.get(cmd.name);
    if (subs) {
      for (const sub of subs) {
        content += generateCommandSection(sub, 3);
      }
    }
  }

  return content;
}

/**
 * Generate a single command section
 */
function generateCommandSection(cmd: CommandInfo, headingLevel: number = 2): string {
  const heading = '#'.repeat(headingLevel);
  const description = getCommandDescription(cmd.displayName);

  let section = `${heading} \`${cmd.displayName}\`\n\n`;

  if (description) {
    section += `${description}\n\n`;
  }

  section += `![${cmd.displayName} --help](${cmd.screenshotPath})\n\n`;

  return section;
}

/**
 * Verify all screenshots are documented
 */
async function verifyDocumentation(
  commands: CommandInfo[]
): Promise<{ missing: string[]; documented: string[] }> {
  const missing: string[] = [];
  const documented: string[] = [];

  // Read all docs files
  let allDocsContent = '';
  for (const docPath of DOCS_TO_CHECK) {
    try {
      const content = await fs.readFile(docPath, 'utf-8');
      allDocsContent += content;
    } catch {
      // File might not exist yet
    }
  }

  // Check each screenshot
  for (const cmd of commands) {
    const filename = path.basename(cmd.screenshotPath);
    if (allDocsContent.includes(filename)) {
      documented.push(filename);
    } else {
      missing.push(filename);
    }
  }

  return { missing, documented };
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const isVerify = process.argv.includes('--verify');

  // Read all SVG files
  let files: string[];
  try {
    files = await fs.readdir(SCREENSHOTS_DIR);
  } catch (error) {
    console.error(`Error: Directory ${SCREENSHOTS_DIR} not found.`);
    console.error('Run `npm run screenshots` first to generate screenshots.');
    process.exit(1);
  }

  const svgFiles = files.filter((f) => f.endsWith('.svg') && f.startsWith('output_'));

  if (svgFiles.length === 0) {
    console.error('No screenshots found in', SCREENSHOTS_DIR);
    process.exit(1);
  }

  // Parse command info from filenames
  const commands = svgFiles.map(parseFilename).sort((a, b) => {
    // Root command first
    if (a.name === '') return -1;
    if (b.name === '') return 1;
    // Then alphabetically
    return a.displayName.localeCompare(b.displayName);
  });

  if (isVerify) {
    // Verify mode
    const { missing, documented } = await verifyDocumentation(commands);

    console.log('CLI Documentation Verification');
    console.log('==============================\n');
    console.log(`Documented: ${documented.length}/${commands.length}`);

    if (missing.length > 0) {
      console.error('\nMissing from documentation:');
      for (const file of missing) {
        console.error(`  - ${file}`);
      }
      console.error('\nRun `npm run docs:cli` to generate CLI_REFERENCE.md');
      process.exit(1);
    }

    console.log('\nAll screenshots are documented.');
  } else {
    // Generate mode
    const content = await generateCliReference(commands);

    await fs.writeFile(OUTPUT_FILE, content, 'utf-8');

    console.log(`Generated: ${OUTPUT_FILE}`);
    console.log(`Commands documented: ${commands.length}`);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
