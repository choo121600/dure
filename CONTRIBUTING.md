# Contributing to Dure

Thank you for contributing to the Dure project.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/choo121600/dure.git
cd dure

# Install dependencies (includes automatic husky setup)
npm install

# Run in development mode
npm run dev
```

## Pre-commit Hooks

This project uses [husky](https://typicode.github.io/husky/) to run automatic verification before commits.

### Checks Performed

| Check | Condition | Description |
|-------|-----------|-------------|
| TypeScript type check | `.ts/.tsx` files staged | Runs `tsc --noEmit` |
| Unit tests | `src/` files changed | Runs related tests only (30s timeout) |
| Screenshot verification | `src/cli/` files changed | Verifies CLI screenshot sync |
| Documentation verification | `src/cli/` or `docs/images/cli/` changed | Verifies CLI_REFERENCE.md sync |
| Commit message | All commits | Validates Conventional Commits format |

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Refactoring
- `perf`: Performance improvements
- `test`: Adding/modifying tests
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes

**Scopes (optional):**
- `cli`: CLI commands
- `core`: Core logic (orchestrator, state-manager, etc.)
- `server`: Web server
- `agents`: Agents (Refiner, Builder, Verifier, Gatekeeper)
- `tui`: Terminal UI
- `docs`: Documentation
- `config`: Configuration files

**Examples:**
```bash
git commit -m "feat(cli): add screenshot command"
git commit -m "fix: resolve memory leak in watcher"
git commit -m "docs: update API documentation"
```

### Bypassing Hooks (Not Recommended)

Use only in emergencies. The same validations run in CI.

```bash
# Skip all hooks
git commit --no-verify -m "emergency fix"

# Skip via environment variable
HUSKY=0 git commit -m "message"
```

### Debugging Hooks

```bash
# Run pre-commit hook manually
./.husky/pre-commit

# Test commit-msg hook manually
echo "feat: test message" | ./.husky/commit-msg /dev/stdin
```

### Troubleshooting

#### "TypeScript type errors found!"

Fix the type errors:
```bash
npx tsc --noEmit
```

#### "Screenshots are out of date!"

Regenerate screenshots:
```bash
npm run screenshots
git add docs/images/cli/
```

#### "CLI documentation is out of date!"

Regenerate documentation:
```bash
npm run docs:cli
git add docs/CLI_REFERENCE.md
```

#### "Tests failed!"

Check failing tests:
```bash
npm test
```

#### "Invalid commit message format!"

Follow Conventional Commits format:
```bash
# Correct format
git commit -m "feat: add new feature"
git commit -m "fix(cli): resolve argument parsing"

# Incorrect format
git commit -m "added new feature"  # missing type
git commit -m "feat add feature"   # missing colon
```

#### Hooks not installed

Reinstall husky:
```bash
npm run prepare
```

## Pull Request

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Commit changes (must pass pre-commit checks)
3. Push the branch: `git push origin feat/my-feature`
4. Create a Pull Request

### PR Checklist

- [ ] Type check passes (`npm run typecheck`)
- [ ] Tests pass (`npm test`)
- [ ] Related documentation updated
- [ ] Conventional Commits format followed

## Code Style

- Use TypeScript strict mode
- Prefer functional programming style
- Use clear variable/function names
- Add comments only when necessary

## Questions?

Please create an issue or start a discussion.
