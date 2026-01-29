# Contributing Guide

Thank you for contributing to Dure! 🎼

## How to Contribute

### Bug Reports

Found a bug? Please report it on GitHub Issues.

**Information to include:**

- Clear title (e.g., "Builder crashes with JSON parsing error")
- Steps to reproduce
- Expected behavior vs actual behavior
- Environment information:
  - OS and version
  - Node.js version
  - tmux version
  - Claude CLI version
  - Dure version
- Log files:
  - `events.log`
  - `state.json`
  - `error.flag` (if exists)

**Template:**

```markdown
## Bug Description
Builder crashes during JSON parsing.

## Steps to Reproduce
1. Run dure start
2. Write the following Briefing: [content]
3. Start Run
4. Crash during Builder Phase

## Expected Behavior
Builder should complete normally.

## Actual Behavior
error.flag is created with "Unexpected token" error

## Environment
- OS: macOS 14.0
- Node.js: v20.0.0
- tmux: 3.3a
- Claude CLI: 1.2.0
- Dure: 0.1.0

## Logs
[Attached files or content]
```

### Feature Suggestions

Want to suggest a new feature? Use the "Feature Requests" category in GitHub Discussions.

**Information to include:**

- Problem: What inconvenience do you currently have?
- Suggestion: What feature do you need?
- Use case: In what situation would you use it?
- Alternatives: Are there any other solutions?

### Code Contributions

Pull Requests are always welcome!

#### Prerequisites

1. **Fork & Clone**

```bash
# Fork: Click "Fork" button on GitHub

# Clone
git clone https://github.com/your-username/dure.git
cd dure

# Add upstream
git remote add upstream https://github.com/choo121600/dure.git
```

2. **Set up development environment**

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Run locally
npm run dev
```

#### Branch Strategy

```bash
# Get latest main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or bugfix branch
git checkout -b fix/bug-description
```

Branch naming:

- `feature/` - New feature
- `fix/` - Bug fix
- `docs/` - Documentation fix
- `refactor/` - Refactoring
- `test/` - Adding tests

#### Writing Code

**Coding style:**

- Follow TypeScript strict mode
- Follow ESLint rules
- Meaningful variable/function names
- Add comments for complex logic

**Testing:**

- Tests are required for new features
- Existing tests must pass
- Maintain coverage above 80%

```bash
# Run tests
npm test

# Check coverage
npm run test:coverage
```

**Commit messages:**

```
<type>: <subject>

<body>

<footer>
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation fix
- `style`: Code formatting (no logic changes)
- `refactor`: Refactoring
- `test`: Adding/modifying tests
- `chore`: Build settings, dependency updates, etc.

Example:

```
feat: Add auto-retry for agent crashes

Added functionality to automatically retry when an agent crashes.
Can be controlled with the config.global.auto_retry.enabled setting.

Closes #123
```

#### Submitting Pull Request

1. **Push changes**

```bash
git add .
git commit -m "feat: Add auto-retry"
git push origin feature/auto-retry
```

2. **Create PR**

Click "New Pull Request" on GitHub

**PR Template:**

```markdown
## Changes
[What did you change?]

## Motivation
[Why is this change needed?]

## Testing
[How did you test it?]

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (if breaking change)
- [ ] All tests pass
- [ ] ESLint passes

## Screenshots (for UI changes)
[Screenshots]

## Related Issues
Closes #123
```

3. **Respond to code review**

- Respond politely to reviewer feedback
- Reflect requested changes
- Discuss in PR comments

### Documentation Contributions

Documentation improvements are also a great contribution!

**Documentation location:**

- Guides: `docs/guide/`
- Architecture: `docs/architecture/`
- API: `docs/api/`
- Misc: `docs/misc/`

**How to edit:**

1. Edit Markdown files in `docs/` folder
2. Verify locally:

```bash
# Run Docsify server
npx docsify serve docs

# Access http://localhost:3000
```

3. Submit PR

**Documentation writing guidelines:**

- Clear and concise
- Include code examples
- Use screenshots (for UI-related content)
- Use internal links

## Development Guide

### Project Structure

```
dure/
├── src/
│   ├── cli/              # CLI commands
│   ├── core/             # Core logic
│   ├── server/           # Web server
│   ├── agents/           # Agent logic
│   └── types/            # TypeScript types
├── templates/            # Prompt templates
├── docs/                 # Documentation
└── tests/                # Tests
```

### Main Modules

| Module | Description |
|--------|-------------|
| `Orchestrator` | Agent execution orchestration |
| `StateManager` | State management |
| `FileWatcher` | File system monitoring |
| `TmuxManager` | tmux session management |
| `UsageTracker` | Token usage tracking |

### Writing Tests

```typescript
// tests/core/orchestrator.test.ts
import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../src/core/orchestrator';

describe('Orchestrator', () => {
  it('should start run with valid briefing', async () => {
    const orchestrator = new Orchestrator();
    const runId = await orchestrator.startRun('# Test Briefing');

    expect(runId).toMatch(/^run-\d{8}-\d{6}$/);
  });

  it('should emit agent.started event', async () => {
    const orchestrator = new Orchestrator();
    let eventReceived = false;

    orchestrator.on('agent.started', () => {
      eventReceived = true;
    });

    await orchestrator.startAgent('refiner');
    expect(eventReceived).toBe(true);
  });
});
```

### Debugging

**Adjust log level:**

```bash
dure start --log-level debug
```

**Breakpoints:**

```typescript
// src/core/orchestrator.ts
console.log('[DEBUG] Starting agent:', agentName);
debugger; // Use Node.js debugger
```

**VSCode debugging:**

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Dure",
      "program": "${workspaceFolder}/src/cli/index.ts",
      "args": ["start"],
      "runtimeArgs": ["-r", "tsx"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Community Guidelines

### Code of Conduct

- 🤝 Respect and consideration
- 💬 Constructive feedback
- 🌍 Respect diversity
- 🚫 No harassment

### Communication Channels

- **GitHub Issues**: Bug reports
- **GitHub Discussions**: Questions, discussions
- **Pull Requests**: Code review

### Response Time

- Issues/PRs: Usually within 3-5 days
- For urgent cases: Add "urgent" label

## Release Process

### Version Management

Uses [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features (backward compatible)
- **Patch** (0.0.1): Bug fixes

### Release Checklist

1. [ ] All tests pass
2. [ ] CHANGELOG.md updated
3. [ ] package.json version updated
4. [ ] Git tag created
5. [ ] npm publish
6. [ ] GitHub Release written

## License

Contributed code is licensed under the [MIT License](../LICENSE).

## Have questions?

- Write a question on GitHub Discussions
- Email: dure@example.com (fictional)

Thank you! 🎼
