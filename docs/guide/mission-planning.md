# Mission Planning Guide

Dure's Mission Planning system breaks down large projects into phases and tasks, each executed through the standard agent pipeline (REFINE → BUILD → VERIFY → GATE).

## Introduction

For complex projects that span multiple features or components, a single Dure run may not be sufficient. The Mission Planning system provides:

- **AI-assisted planning**: Planner and Critic agents design the project structure
- **Multi-phase execution**: Tasks organized into logical phases
- **Dependency management**: Tasks execute in the correct order
- **Kanban visualization**: Real-time progress tracking
- **Context carry-forward**: Each task passes context to dependent tasks

---

## Quick Start

### Create a Mission

```bash
# Interactive mission creation
dure mission create

# Or with a description file
dure mission create --file mission-description.md
```

### View Missions

```bash
# List all missions
dure mission list

# Show mission status
dure mission status <mission-id>
```

### Execute a Mission

```bash
# Run a mission
dure mission run <mission-id>

# View kanban board
dure mission kanban <mission-id>
```

---

## Planning Pipeline

When you create a mission, Dure uses a Planner/Critic loop to design the execution plan.

### Planning Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Planning Pipeline                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User Description                                               │
│         │                                                        │
│         ▼                                                        │
│   ┌──────────┐                                                   │
│   │ Planner  │ ──▶ Draft Plan v1                                │
│   │ (haiku)  │                                                   │
│   └──────────┘                                                   │
│         │                                                        │
│         ▼                                                        │
│   ┌──────────┐                                                   │
│   │ Critic   │ ──▶ Critique v1                                  │
│   │ (haiku)  │                                                   │
│   └──────────┘                                                   │
│         │                                                        │
│         ├─── approved ──▶ Ready to Execute                      │
│         │                                                        │
│         ├─── needs_revision ──▶ Planner v2 ──▶ Critic v2        │
│         │                                                        │
│         └─── needs_human ──▶ Human Review                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Auto-Approval Criteria

Plans are automatically approved if the critique has:
- 0 critical issues
- 0 major issues
- ≤3 minor issues

Otherwise, the plan requires human review.

---

## Mission Structure

### Phases

A mission is divided into phases, representing major milestones:

```
Mission: "Build Authentication System"
├── Phase 1: Core Infrastructure
│   ├── Task 1.1: Set up database schema
│   └── Task 1.2: Create user model
├── Phase 2: Authentication
│   ├── Task 2.1: Implement login endpoint
│   ├── Task 2.2: Implement registration endpoint
│   └── Task 2.3: Add JWT token handling
└── Phase 3: Security
    ├── Task 3.1: Add rate limiting
    └── Task 3.2: Implement password policies
```

### Tasks

Each task runs through the full Dure pipeline:

```
Task 2.1: Implement login endpoint
    │
    ▼
REFINE ──▶ BUILD ──▶ VERIFY ──▶ GATE
    │                              │
    │                         PASS │
    │                              ▼
    │                      CarryForward
    │                              │
    └──────────────────────────────┘
                                   │
                                   ▼
                        Task 2.2 can start
```

### Dependencies

Tasks can depend on other tasks:

```yaml
Task 2.1: Login endpoint
  depends_on: [Task 1.2]  # Needs user model

Task 2.3: JWT handling
  depends_on: [Task 2.1, Task 2.2]  # Needs both endpoints
```

---

## Kanban Board

The kanban board provides a visual overview of mission progress.

### Starting the Kanban

```bash
# TUI kanban board
dure mission kanban <mission-id>

# Web dashboard (includes kanban)
dure mission run <mission-id> --web
```

### Kanban Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Mission: Build Authentication System                            │
│  Status: in_progress    Progress: 40%                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Phase 1: Core         Phase 2: Auth        Phase 3: Security   │
│   ┌─────────────┐       ┌─────────────┐      ┌─────────────┐     │
│   │ ✓ Task 1.1  │       │ ● Task 2.1  │      │ ○ Task 3.1  │     │
│   │ ✓ Task 1.2  │       │ ○ Task 2.2  │      │ ○ Task 3.2  │     │
│   │             │       │ ⊗ Task 2.3  │      │             │     │
│   └─────────────┘       └─────────────┘      └─────────────┘     │
│                                                                   │
│   Legend: ✓ Passed  ● Running  ○ Pending  ⊗ Blocked             │
├──────────────────────────────────────────────────────────────────┤
│   [q] Quit  [r] Refresh  [1-3] Select phase                      │
└──────────────────────────────────────────────────────────────────┘
```

### Task Status Icons

| Icon | Status | Description |
|------|--------|-------------|
| `○` | Pending | Waiting to execute |
| `⊗` | Blocked | Waiting for dependencies |
| `●` | In Progress | Currently running |
| `✓` | Passed | Completed successfully |
| `✗` | Failed | Execution failed |
| `?` | Needs Human | Requires human intervention |

---

## Context Carry-Forward

When a task completes successfully, Gatekeeper generates a `CarryForward` that passes context to dependent tasks.

### CarryForward Contents

```json
{
  "task_id": "task-001",
  "key_decisions": [
    "JWT authentication selected",
    "Redis for session storage"
  ],
  "created_artifacts": [
    "src/auth/",
    "src/middleware/auth.ts"
  ],
  "api_contracts": [
    "POST /auth/login",
    "GET /auth/refresh"
  ],
  "warnings": [
    "Rate limiting not implemented - needed in Phase 3"
  ]
}
```

### How It Works

1. Task completes with PASS verdict
2. Gatekeeper generates CarryForward
3. Dependent tasks receive CarryForward in their briefing
4. Tasks build on previous work with full context

---

## Execution Granularity

You can control how tasks are executed:

```bash
# Execute each task as a separate run (default)
dure mission run <id> --granularity task

# Execute each phase as a batch
dure mission run <id> --granularity phase

# Let the system decide
dure mission run <id> --granularity auto
```

---

## File Structure

Mission data is stored in `.dure/missions/`:

```
.dure/missions/
└── mission-{id}/
    ├── state.json           # Mission state
    ├── plan-draft-v1.json   # First planning draft
    ├── critique-v1.json     # First critique
    ├── plan-draft-v2.json   # Revised plan (if needed)
    ├── critique-v2.json     # Second critique (if needed)
    ├── phases/
    │   └── phase-{n}/
    │       └── tasks/
    │           └── task-{id}/
    │               ├── briefing.md
    │               ├── carry-forward.json
    │               └── run-id.txt
    └── context/
        └── phase-{n}-context.json
```

---

## Best Practices

### Writing Mission Descriptions

Good mission descriptions include:

1. **Clear objectives**: What should be achieved
2. **Scope boundaries**: What is NOT included
3. **Technical constraints**: Framework, language requirements
4. **Quality requirements**: Test coverage, performance targets

**Example:**

```markdown
# Build User Authentication System

## Objective
Implement a complete user authentication system with login, registration,
and password reset functionality.

## Scope
- User registration with email verification
- Login with JWT tokens
- Password reset via email
- NOT included: OAuth, 2FA (future phase)

## Technical Constraints
- Express.js backend
- PostgreSQL database
- Jest for testing
- Min 80% test coverage

## Acceptance Criteria
- All endpoints documented in OpenAPI
- Rate limiting on auth endpoints
- Secure password storage (bcrypt)
```

### Handling Failures

When a task fails:

1. The mission pauses at that task
2. Check the task's run logs for details
3. Options:
   - Fix the issue and retry: `dure mission run <id> --resume`
   - Skip the task: `dure mission skip <task-id>`
   - Cancel the mission: `dure mission cancel <id>`

---

## Troubleshooting

### Planning Takes Too Long

**Cause:** Complex project with many components

**Solution:** Break down into smaller missions or provide more specific constraints

### Tasks Failing Frequently

**Cause:** Insufficient context or unclear requirements

**Solution:**
- Check CarryForward from previous tasks
- Add more detail to task descriptions
- Consider reducing task scope

### Blocked Tasks Not Starting

**Cause:** Dependency tasks haven't completed

**Solution:**
- Check kanban board for blocked dependencies
- Resolve failed dependencies first

---

## Related Documents

- [Understanding Agents](/guide/understanding-agents.md) - Agent roles and behavior
- [Writing Briefings](/guide/writing-briefings.md) - How to write effective task descriptions
- [Monitoring Dashboard](/guide/monitoring-dashboard.md) - TUI and Web monitoring
- [CLI Reference](/api/cli.md) - Complete CLI documentation
