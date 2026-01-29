# Frequently Asked Questions (FAQ)

Common questions and answers about using Dure.

## General

### What is Dure?

Dure is a software engineering system that utilizes AI agents. Four specialized agents (Refiner, Builder, Verifier, Gatekeeper) collaborate sequentially to generate code, and humans only intervene at critical decision points.

### Why "Dure"?

It means multiple agents collaborate harmoniously like an orchestra. 🎼

### Is it a finished product?

No, Dure is an **MVP (Minimum Viable Product)**. The goal is to prove that the "Agentic Software Engineering" paradigm actually works.

### Can I use it commercially?

Yes, it's MIT licensed.

## Installation and Setup

### Node.js version doesn't match

Dure requires Node.js 18.0.0 or higher:

```bash
node --version
# Should be v18.0.0 or higher

# When using nvm
nvm install 18
nvm use 18
```

### tmux is not installed

tmux is a required dependency:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Verify
tmux -V
```

### What is Claude CLI?

Claude CLI is Anthropic's official CLI tool that allows you to use Claude from the terminal. For installation instructions, refer to the [Anthropic official documentation](https://docs.anthropic.com/claude/docs/claude-cli).

## Usage

### How do I write a Briefing?

Refer to the [Briefing Writing Guide](/guide/writing-briefings.md). Key points:

- ✅ Specific requirements
- ✅ Clear constraints
- ✅ Expected behavior definition
- ❌ Avoid vague expressions

### CRPs are generated too frequently

There's a high possibility that your Briefing contains vague expressions ("appropriately", "as you see fit", "reasonably"). Modify with specific values.

Examples:
- ❌ "appropriate limit" → ✅ "60 times per minute"
- ❌ "quickly" → ✅ "within 100ms"

### Agents take too long

A few solutions:

1. **Model downgrade**: Opus/Sonnet → Haiku
2. **Simplify Briefing**: Split complex requirements into multiple Runs
3. **Shorten timeout**: Adjust in config

See [Performance Troubleshooting](/guide/troubleshooting.md#performance-issues)

### Costs are too high

1. **Optimize models**: Only Builder uses Sonnet, rest use Haiku
2. **Limit iterations**: Reduce `max_iterations` to 2
3. **Improve Briefing quality**: Clear Briefing → Fewer retries

See [Cost Optimization](/advanced/cost-optimization.md)

### Can I automatically merge MRP?

In the current MVP version, you need to manually apply the code:

```bash
cp -r .dure/runs/{run_id}/mrp/code/* .
git add .
git commit -m "..."
```

Auto-merge feature will be added in future versions.

## Technical Questions

### How do I check tmux sessions?

```bash
# List tmux sessions
tmux list-sessions

# Attach to a specific session
tmux attach-session -t dure-run-{timestamp}

# Detach from session
Ctrl-b + d
```

### What permissions do agents run with?

Agents are run with the `--dangerously-skip-permissions` flag. This means they have access to all files within the project.

⚠️ Only use with projects you trust.

### Can I run multiple projects simultaneously?

Currently only one project at a time is supported. Running `dure start` separately in each project folder will cause port conflicts.

Solution:
```bash
cd project1
dure start --port 3000

cd project2
dure start --port 3001
```

### Should I commit the .dure folder to Git?

It's optional:

**When committing:**
- ✅ Share settings with team members
- ✅ Preserve execution history
- ❌ Increased repository size

**When not committing:**
- ✅ Save repository size
- ❌ Reconfigure settings each time

Recommended: Only commit `.dure/config/`

```gitignore
# .gitignore
.dure/runs/
!.dure/config/
```

### How does usage tracking work?

Dure uses [ccusage](https://ccusage.com/) to collect usage from Claude Code's local JSONL files:

1. Claude Code writes JSONL to `~/.claude/projects/`
2. UsageTracker detects file changes (chokidar)
3. Parse usage with ccusage
4. Real-time updates to UI via WebSocket

Install ccusage:
```bash
npm install -g ccusage
```

## Errors and Troubleshooting

### "Port 3000 is already in use"

Start on a different port or terminate the existing process:

```bash
# Use different port
dure start --port 3001

# Or terminate process on port 3000
lsof -ti:3000 | xargs kill
```

### Agent crashed

Check the error.flag file:

```bash
cat .dure/runs/{run_id}/{agent}/error.flag
```

In most cases, it will automatically retry. If it keeps failing:

1. Check if the Briefing is too complex
2. Change to a more powerful model (Haiku → Sonnet)
3. Create a GitHub Issue

### tmux sessions remain

Terminate manually:

```bash
tmux kill-session -t dure-run-{timestamp}

# Terminate all dure sessions
tmux list-sessions | grep dure | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

### Running out of disk space

Clean up old Runs:

```bash
# Delete Runs older than 30 days
dure clean

# Delete Runs older than 7 days
dure clean --days 7
```

## Advanced Usage

### Can I use custom prompts?

Not supported in the current MVP version, but prompt template customization will be added in future versions.

### Can I use my own AI model?

Currently only Claude API is supported. Support for other models like OpenAI, Gemini is on the roadmap.

### Can I use it in CI/CD?

Currently only interactive use is supported. CI/CD integration will be added in the future.

### Can I customize agents?

Currently only model and timeout settings are configurable. We plan to add more fine-grained control over agent behavior in the future.

## Roadmap

### When will v1.0 be released?

Currently at v0.1 (MVP). We're aiming for v1.0 after receiving community feedback and making improvements.

### When will auto-merge be added?

Planned for v0.2 or v0.3. We plan to provide it after sufficient safety verification.

### What are the plans for other AI model support?

We're planning support for models beyond OpenAI (GPT-4), Google (Gemini), and Anthropic Claude API.

### Are there plans for a cloud version?

It's on the long-term roadmap, but stabilizing the local version first is the priority.

## Contributing

### How can I contribute?

- 🐛 Bug reports: GitHub Issues
- 💡 Feature suggestions: GitHub Discussions
- 📝 Documentation improvements: Pull Request
- 💻 Code contributions: Pull Request

See [Contributing Guide](/misc/contributing.md)

### Where do I make feature requests?

Please write in the "Feature Requests" category of GitHub Discussions.

### I found a bug

Please report on GitHub Issues with the following information:

- Error message
- `events.log` contents
- `state.json` contents
- Execution environment (OS, Node version, tmux version)

## Community

### Is there an official community?

- GitHub Discussions: Questions, discussions
- GitHub Issues: Bug reports
- Twitter: [@dure_dev](https://twitter.com/dure_dev) (fictional)

### Is there a newsletter?

Not currently, but you can receive updates by setting up "Watch" on GitHub.

## Miscellaneous

### What is "Agentic Software Engineering"?

It's a paradigm where AI agents proactively perform software engineering tasks, while humans focus only on judgment and decisions.

### What are the differences from similarly named projects?

Dure's differences:

- ✅ File-based orchestration (clear interfaces)
- ✅ Complete traceability (all processes recorded)
- ✅ Human-centered design (CRP/VCR)
- ✅ tmux-based isolation (easy debugging)

### Is there commercial support?

Currently only community support is provided. Commercial support will be considered in the future.

## Problem not resolved?

1. Check the [Troubleshooting Guide](/guide/troubleshooting.md)
2. Search [GitHub Discussions](https://github.com/choo121600/dure/discussions)
3. Write a new question

We're here to help! 🎼
