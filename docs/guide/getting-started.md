# Quick Start

This guide is a step-by-step tutorial for first-time Dure users.

## Prerequisites

### 1. Install Required Tools

#### tmux

Dure uses tmux to run multiple agents in parallel.

<!-- tabs:start -->

#### **macOS**

```bash
brew install tmux
```

#### **Ubuntu/Debian**

```bash
sudo apt-get install tmux
```

#### **CentOS/RHEL**

```bash
sudo yum install tmux
```

<!-- tabs:end -->

Verify installation:

```bash
tmux -V
# tmux 3.3a or higher
```

#### Claude CLI

Claude CLI must be installed and the `claude` command must work.

```bash
claude --version
```

?> For Claude CLI installation instructions, refer to the [Anthropic official documentation](https://docs.anthropic.com/claude/docs/claude-cli).

### 2. Check Node.js Version

```bash
node --version
# v18.0.0 or higher
```

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/choo121600/dure.git
cd dure
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

This command:
- Compiles TypeScript files
- Copies static files for the web server
- Copies template files

### 4. Global Installation (Optional)

Installing globally allows you to use the `dure` command from anywhere:

```bash
npm link
```

## First Run

### 1. Prepare Project Folder

Navigate to the project folder where you want to run Dure:

```bash
cd /path/to/your-project
```

!> Dure creates a `.dure/` folder in the current directory. Running in a Git repository is recommended.

### 2. Start Dure

```bash
# Using npx (if not globally installed)
npx dure start

# Or if globally installed
dure start
```

### 3. Open Web Dashboard

The browser will automatically open and connect to `http://localhost:3873`.

If it doesn't open automatically, connect manually:

```bash
open http://localhost:3873  # macOS
```

## First Run Execution

### 1. Start New Run

Click the **"New Run"** button on the dashboard.

### 2. Write Briefing

Let's start with a simple example:

```markdown
# Hello World Function Implementation

## Requirements
- Create `sayHello` function
- Parameter: name (string)
- Return value: "Hello, {name}!" (string)

## Constraints
- Implement in TypeScript
- Write in src/utils/hello.ts file

## Expected Behavior
sayHello("World") → "Hello, World!"
sayHello("Alice") → "Hello, Alice!"
```

### 3. Start Run

Click the **"Start Run"** button.

### 4. Monitor Progress

You can check agent progress in real-time on the dashboard:

```
[✓ Refine] → [● Build] → [ Verify] → [ Gate]
             ↑
         "Building... (1:23)"
```

### 5. Check Results

When all agents are complete:

1. **MRP (Merge-Readiness Pack)** is generated
2. You can review changes, test results, and cost information
3. Select **"Approve"** or **"Request Changes"**

## CLI Options

### Change Port

```bash
dure start --port 3001
```

### Disable Auto Browser Opening

```bash
dure start --no-browser
```

### Check Current Status

```bash
dure status
```

Example output:

```
Current Run: run-20240126-143022
Phase: build (iteration 1/3)
Status: running

Agents:
  ✓ Refiner   - completed (35s)
  ● Builder   - running (1:23)
  ○ Verifier  - pending
  ○ Gatekeeper - pending

Usage: $0.058
```

### Stop Run

```bash
dure stop
```

### View History

```bash
dure history
```

Example output:

```
Recent Runs:
  run-20240126-143022  PASS      $0.12   2 min ago
  run-20240126-120000  FAIL      $0.08   3 hours ago
  run-20240125-180000  PASS      $0.15   1 day ago
```

## Folder Structure

When Dure starts, a `.dure/` folder is created in your project:

```
your-project/
├── src/
├── package.json
└── .dure/
    ├── config/              # Configuration files
    │   ├── global.json
    │   ├── refiner.json
    │   ├── builder.json
    │   ├── verifier.json
    │   └── gatekeeper.json
    └── runs/                # Run history
        └── run-{timestamp}/
            ├── state.json
            ├── events.log
            ├── briefing/
            ├── builder/
            ├── verifier/
            ├── gatekeeper/
            ├── crp/
            ├── vcr/
            └── mrp/
```

?> You can add `.dure/` to `.gitignore`, but committing it is also good if you want to keep run history.

## tmux Session

Dure creates a tmux session for each Run:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Refiner  │ Builder  │ Verifier │Gatekeeper│
│ (pane 0) │ (pane 1) │ (pane 2) │ (pane 3) │
├──────────┴──────────┴──────────┴──────────┤
│              Debug Shell (pane 4)          │
├────────────────────────────────────────────┤
│              ACE Server (pane 5)           │
└────────────────────────────────────────────┘
```

You can attach to the tmux session to directly view agent output:

```bash
tmux attach-session -t dure-run-20240126-143022
```

To exit session: `Ctrl-b` + `d` (detach)

## Next Steps

- [Briefing Writing Guide](/guide/writing-briefings.md) - How to write effective Briefings
- [Understanding Agents](/guide/understanding-agents.md) - Roles and operation principles of each agent
- [Configuration Files](/api/configuration.md) - Customizing agent settings

## Troubleshooting

If you encounter issues, refer to the [Troubleshooting Guide](/guide/troubleshooting.md).
