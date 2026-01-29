---
name: new-command
description: Generate a new CLI command with Commander.js. Use when user asks to create a command, add CLI functionality, or implement a new dure subcommand.
---

# Create New CLI Command

## Context
This project uses Commander.js for CLI management. Commands follow a consistent structure:
- Location: `src/cli/commands/<command-name>.ts`
- Registration: Added to `src/cli/program.ts`
- Imports: ES modules with `.js` extensions (required for TypeScript ES module output)
- Formatting: chalk for colored output, consistent error handling

## Instructions

### 1. Create Command File
Create `src/cli/commands/<command-name>.ts` with:
- Exported async function named `<commandName>Command`
- TypeScript interface for options (if needed)
- Chalk for colored console output
- Error handling with `process.exit(1)` for failures
- Import core managers from `../../core/` with `.js` extension

### 2. Register Command
Add to `src/cli/program.ts`:
1. Import: `import { <commandName>Command } from './commands/<command-name>.js';`
2. Register in `createProgram()` function:
   ```typescript
   program
     .command('<command-name>')
     .description('Description of command')
     .option('--flag', 'Flag description')
     .action(<commandName>Command);
   ```

### 3. Add Tests (Optional but Recommended)
If adding tests, create `tests/unit/cli/<command-name>.test.ts` using Vitest.

## Conventions (from existing commands)

### File Structure Pattern
See `src/cli/commands/status.ts` and `src/cli/commands/history.ts` for simple commands.
See `src/cli/commands/clean.ts` and `src/cli/commands/delete.ts` for commands with options.

### Key Patterns:
1. **ES Module Imports**: Always use `.js` extension in imports
   ```typescript
   import { RunManager } from '../../core/run-manager.js';
   import { StateManager } from '../../core/state-manager.js';
   ```

2. **Chalk Usage**: Consistent color scheme
   - `chalk.blue()` - Headers/titles
   - `chalk.green()` - Success messages
   - `chalk.yellow()` - Warnings/no-ops
   - `chalk.red()` - Errors
   - `chalk.gray()` - Secondary info/timestamps

3. **Options Interface**: Type command options
   ```typescript
   interface CommandOptions {
     flag?: boolean;
     param?: string;
   }

   export async function commandNameCommand(options: CommandOptions): Promise<void>
   ```

4. **Error Handling**: Use consistent pattern
   ```typescript
   if (error) {
     console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
     process.exit(1);
   }
   ```

5. **User Confirmation**: For destructive operations (see `src/cli/commands/delete.ts`)
   ```typescript
   function confirm(message: string): Promise<boolean> {
     return new Promise((resolve) => {
       const rl = createInterface({
         input: process.stdin,
         output: process.stdout,
       });

       rl.question(`${message} (y/N) `, (answer) => {
         rl.close();
         resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
       });
     });
   }
   ```

6. **Manager Instantiation**: Use `process.cwd()` as project root
   ```typescript
   const projectRoot = process.cwd();
   const runManager = new RunManager(projectRoot);
   ```

## Template

### Basic Command (No Options)
Based on `src/cli/commands/status.ts`:

```typescript
import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';

export async function commandNameCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  // Command logic here

  console.log(chalk.blue('🎼 Command Title'));
  console.log();
  console.log(chalk.white('Output here'));
}
```

### Command with Options
Based on `src/cli/commands/clean.ts`:

```typescript
import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';

interface CommandOptions {
  force?: boolean;
  param?: string;
}

export async function commandNameCommand(options: CommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  // Validate options
  if (!options.param) {
    console.error(chalk.red('Error: --param is required'));
    process.exit(1);
  }

  // Command logic here

  console.log(chalk.green('✓ Success message'));
}
```

### Command with Argument + Options
Based on `src/cli/commands/delete.ts`:

```typescript
import chalk from 'chalk';
import { createInterface } from 'readline';
import { RunManager } from '../../core/run-manager.js';

export async function commandNameCommand(
  argument: string,
  options: { force?: boolean }
): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  // Validation
  if (!argument) {
    console.error(chalk.red('Error: argument is required'));
    process.exit(1);
  }

  // Confirmation if needed
  if (!options.force) {
    const confirmed = await confirm(`Are you sure?`);
    if (!confirmed) {
      console.log(chalk.yellow('Operation cancelled.'));
      return;
    }
  }

  // Command logic here

  console.log(chalk.green(`✓ Completed: ${argument}`));
}

function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
```

## Registration in program.ts

Add import at the top:
```typescript
import { commandNameCommand } from './commands/<command-name>.js';
```

Add registration in `createProgram()` function:

```typescript
// Basic command (no options)
program
  .command('command-name')
  .description('Brief description of what this command does')
  .action(commandNameCommand);

// With options
program
  .command('command-name')
  .description('Brief description')
  .option('-f, --force', 'Skip confirmation')
  .option('--param <value>', 'Parameter description', 'default-value')
  .action(commandNameCommand);

// With argument + options
program
  .command('command-name <argument>')
  .description('Brief description')
  .option('-f, --force', 'Skip confirmation')
  .action(commandNameCommand);
```

## Output

After implementation:
- `src/cli/commands/<command-name>.ts` - Command implementation
- `src/cli/program.ts` - Updated with new command registration
- (Optional) `tests/unit/cli/<command-name>.test.ts` - Unit tests

## Testing

Test the command works:
```bash
# Build first
npm run build

# Test the command
node dist/cli/index.js command-name --help
node dist/cli/index.js command-name
```

Or in development:
```bash
npm run dev -- command-name --help
```

## Common Managers

Available core managers (import from `../../core/` with `.js`):
- `RunManager` - Manage run lifecycle, list runs, delete runs
- `StateManager` - Load/save run state
- `TmuxManager` - tmux session management
- `Orchestrator` - High-level run orchestration

Types available from `../../types/index.js`:
- `Phase`, `AgentStatus`, `RunState`, etc.

## Examples

See these commands for reference:
- Simple query: `src/cli/commands/status.ts`, `src/cli/commands/history.ts`
- With options: `src/cli/commands/clean.ts`, `src/cli/commands/start.ts`
- With argument: `src/cli/commands/delete.ts`
- Complex/interactive: `src/cli/commands/recover.ts`, `src/cli/commands/init.ts`
