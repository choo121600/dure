# Reviewing MRP

This explains how to effectively review MRP (Merge-Readiness Pack).

## What is MRP?

**MRP (Merge-Readiness Pack)** is the final deliverable package generated when the Gatekeeper gives a PASS judgment.

MRP includes all information needed to merge the code:

- 📄 Summary of changes
- 💾 Final code
- 🧪 Test files
- 📊 Test results
- 💰 Cost information
- 📝 Design rationale and logs

## MRP Notification

When MRP is generated:

1. **Notification displayed** on web dashboard
2. **Run status** changes to "ready_for_merge"
3. **Terminal bell** sounds (if configured)

Click "Review MRP" on the dashboard to navigate to the MRP page.

## MRP Structure

```
.dure/runs/{run_id}/mrp/
├── summary.md          # Summary (read first)
├── code/               # Final code snapshot
│   └── src/
│       └── ...
├── tests/              # Test files
│   └── *.test.ts
└── evidence.json       # Evidence and metadata
```

### 1. summary.md

**This is the file you should read first.**

```markdown
# Merge-Readiness Pack

## Run Information
- Run ID: run-20240126-143022
- Total iterations: 2
- Completion time: 2024-01-26T15:00:00Z
- Duration: 30 minutes

## Changes
### Added Files
- `src/middleware/rateLimiter.ts` (45 lines)
- `src/middleware/__tests__/rateLimiter.test.ts` (120 lines)

### Modified Files
- `src/app.ts` (+3 lines, -0 lines)
  - Registered rateLimiter middleware

## Test Results
- Total 15 tests
- Passed: 15 (100%)
- Failed: 0
- Coverage: 95%

### Test Details
✅ Happy path (5)
✅ Edge cases (5)
✅ Error cases (5)

## Design Decisions
1. **Rate limiting criteria**: IP-based, 60 per minute (VCR-001)
2. **Storage**: In-memory Map (external library prohibition constraint)
3. **Cleanup**: Clean expired items every 1 minute

## Cost
- Total: $0.124
  - Refiner (iteration 1): $0.002
  - Builder (iteration 1): $0.055
  - Builder (iteration 2): $0.030
  - Verifier: $0.025
  - Gatekeeper: $0.012

## Review Pass Reason
- ✅ All tests passed
- ✅ 100% Briefing requirements met
- ✅ Good code quality (readability, maintainability)
- ✅ No security issues
- ✅ Minimal performance impact
```

### 2. code/

A **snapshot** of the final code. Only changed or added files are included.

```
mrp/code/
└── src/
    ├── middleware/
    │   └── rateLimiter.ts
    └── app.ts
```

To apply directly to your project:

```bash
cp -r .dure/runs/{run_id}/mrp/code/* .
```

### 3. tests/

Generated test files.

```
mrp/tests/
└── rateLimiter.test.ts
```

### 4. evidence.json

Metadata and evidence links:

```json
{
  "tests": {
    "total": 15,
    "passed": 15,
    "failed": 0,
    "coverage": 95,
    "details": [
      {"name": "should allow requests within limit", "status": "passed"},
      {"name": "should block requests over limit", "status": "passed"}
    ]
  },
  "files_changed": [
    {
      "path": "src/middleware/rateLimiter.ts",
      "type": "added",
      "lines": 45
    },
    {
      "path": "src/app.ts",
      "type": "modified",
      "lines_added": 3,
      "lines_removed": 0
    }
  ],
  "decisions": ["vcr-001"],
  "iterations": 2,
  "logs": {
    "refiner": "briefing/log.md",
    "builder": "builder/log.md",
    "verifier": "verifier/log.md",
    "gatekeeper": "gatekeeper/log.md"
  },
  "usage": {
    "total_input_tokens": 47500,
    "total_output_tokens": 12800,
    "total_cost_usd": 0.124
  }
}
```

## Review Checklist

### Step 1: Review Summary (summary.md)

- [ ] Check Run information (iteration count, duration)
- [ ] Do changes match expectations?
- [ ] Did all tests pass?
- [ ] Are design decisions reasonable?
- [ ] Is cost within budget?

### Step 2: Review Code (code/)

#### Structure and Location

- [ ] Is file location appropriate?
- [ ] Does naming follow project conventions?
- [ ] Is folder structure consistent?

#### Code Quality

- [ ] Is readability good?
- [ ] Is there no duplicate code?
- [ ] Are comments appropriate? (not excessive?)
- [ ] Is error handling appropriate?

#### Functional Correctness

- [ ] Does it meet Briefing requirements?
- [ ] Are edge cases considered?
- [ ] Are there no security vulnerabilities?

### Step 3: Review Tests (tests/)

- [ ] Are tests sufficient?
- [ ] Is happy path covered?
- [ ] Are edge cases tested?
- [ ] Are error cases tested?
- [ ] Is test code readable?

### Step 4: Review Logs (Optional)

If you want to understand design rationale:

```bash
# Builder log
cat .dure/runs/{run_id}/builder/log.md

# Verifier log
cat .dure/runs/{run_id}/verifier/log.md

# Gatekeeper review
cat .dure/runs/{run_id}/gatekeeper/review.md
```

## Reviewing in Web UI

### MRP Page Structure

```
┌─────────────────────────────────────────────┐
│  Merge-Readiness Pack      run-{timestamp}  │
├─────────────────────────────────────────────┤
│                                              │
│  [Summary] [Code] [Tests] [Evidence] [Logs] │
│                                              │
│  ## Summary                                  │
│                                              │
│  ✅ All tests passed (15/15)                │
│  ✅ Requirements met (100%)                 │
│  💰 Cost: $0.124                            │
│  ⏱️ Duration: 30 minutes                    │
│                                              │
│  ### Changes                                 │
│  + src/middleware/rateLimiter.ts (45 lines) │
│  ~ src/app.ts (+3, -0)                       │
│                                              │
│  ### Tests                                   │
│  ✅ Happy path (5)                           │
│  ✅ Edge cases (5)                           │
│  ✅ Error cases (5)                          │
│                                              │
│  ### Design Decisions                        │
│  1. IP-based rate limiting (VCR-001)        │
│  2. In-memory storage                        │
│  3. Cleanup every 1 minute                   │
│                                              │
│  [Approve]  [Request Changes]  [Download]    │
│                                              │
└─────────────────────────────────────────────┘
```

### Tab Contents

#### Summary Tab

- Summary information (summary.md)
- Key information for quick decisions

#### Code Tab

- Code diff viewer
- Syntax highlighting
- Changes by file

#### Tests Tab

- Test code
- Detailed test results
- Coverage report

#### Evidence Tab

- evidence.json content
- Metadata
- Links

#### Logs Tab

- All agent logs
- Chronological events
- Debug information

## Making a Decision

### Option 1: Approve

**When to Approve?**

- ✅ All requirements met
- ✅ Good code quality
- ✅ Sufficient tests
- ✅ Reasonable design decisions

**After Approve:**

1. Run status changes to "completed"
2. Manually apply code to project

```bash
# Copy code
cp -r .dure/runs/{run_id}/mrp/code/* .

# Git commit
git add .
git commit -m "feat: Add rate limiter middleware

Generated by Dure run-{timestamp}

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>"

# Git push
git push
```

### Option 2: Request Changes

**When to Request Changes?**

- ❌ Requirements missing
- ❌ Code quality issues
- ❌ Insufficient tests
- ❌ Design issues

**When Requesting Changes:**

1. Write feedback:

```markdown
## Change Requests

### 1. Performance Issue
- In-memory Map may grow indefinitely
- Potential memory leak

### 2. Missing Tests
- Concurrent request test needed
- Cleanup logic test needed

### 3. Code Improvements
- Extract magic numbers (60, 60000) to constants
```

2. After submission:
   - Briefing is updated
   - Builder restarts (iteration increases)
   - Re-implements reflecting changes

### Option 3: Download

Download only the code and apply manually:

```bash
# Click "Download" in web UI
# Or
tar -czf mrp.tar.gz .dure/runs/{run_id}/mrp/
```

## Practical Examples

### Example 1: Simple Utility Function

**summary.md:**

```markdown
## Changes
+ src/utils/formatDate.ts (30 lines)

## Test Results
- Total 8 tests
- Passed: 8 (100%)

## Cost
Total: $0.018
```

**Review:**

```bash
# Check code
cat .dure/runs/{run_id}/mrp/code/src/utils/formatDate.ts

# Simple and sufficient tests → Approve
```

### Example 2: Complex API Implementation

**summary.md:**

```markdown
## Changes
+ src/api/users.ts (150 lines)
+ src/models/User.ts (80 lines)
~ src/app.ts (+5, -0)

## Test Results
- Total 25 tests
- Passed: 23 (92%)
- Failed: 2

## Iteration
Passed after 2 retries
```

**Review:**

```bash
# Check code (complex)
cat .dure/runs/{run_id}/mrp/code/src/api/users.ts

# Check logs (why 2 retries?)
cat .dure/runs/{run_id}/gatekeeper/review.md

# Check failed tests
cat .dure/runs/{run_id}/verifier/results.json
```

**Findings:**

- Authentication middleware missing
- Error messages inconsistent

**Decision:** Request Changes

```markdown
## Change Requests

1. Need to add authentication middleware
2. Standardize error messages
3. Strengthen input validation
```

### Example 3: Refactoring

**summary.md:**

```markdown
## Changes
~ src/services/UserService.ts (-120 lines, +85 lines)
+ src/services/validators.ts (40 lines)

## Test Results
- All existing tests passed
- 10 new tests added

## Cost
Total: $0.095
```

**Review:**

```bash
# Check diff
diff -u src/services/UserService.ts \
  .dure/runs/{run_id}/mrp/code/src/services/UserService.ts

# Refactoring result:
# - Functions are smaller and more readable
# - Reusable validators separated
# - Existing behavior maintained (tests pass)
```

**Decision:** Approve

## Automation Script

### Quick Apply Script

```bash
#!/bin/bash
# apply-mrp.sh

RUN_ID=$1

if [ -z "$RUN_ID" ]; then
  echo "Usage: ./apply-mrp.sh run-{timestamp}"
  exit 1
fi

MRP_DIR=".dure/runs/$RUN_ID/mrp"

if [ ! -d "$MRP_DIR" ]; then
  echo "Error: MRP not found"
  exit 1
fi

# Check summary
echo "=== Summary ==="
cat "$MRP_DIR/summary.md"
echo ""

read -p "Apply this MRP? (y/N): " confirm
if [ "$confirm" != "y" ]; then
  echo "Cancelled"
  exit 0
fi

# Apply code
cp -r "$MRP_DIR/code/"* .

# Git commit
git add .
git commit -m "feat: Apply MRP from $RUN_ID

$(head -n 20 $MRP_DIR/summary.md)

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>"

echo "Applied successfully"
```

Usage:

```bash
chmod +x apply-mrp.sh
./apply-mrp.sh run-20240126-143022
```

## Cautions

### ⚠️ Don't Blindly Approve

Even if tests pass:

- Requirements may be missing
- Edge cases may not be considered
- Performance issues may exist

### ⚠️ Check for Conflicts with Existing Code

MRP is based on code at Run start time. Conflicts possible if other changes were made since:

```bash
# Pull latest code
git pull

# Check diff before applying MRP
diff -r .dure/runs/{run_id}/mrp/code/ .
```

### ⚠️ Security Review

Especially these items require manual review:

- User input handling
- Authentication/authorization
- Database queries
- External API calls

## Next Steps

- [Troubleshooting](/guide/troubleshooting.md) - Solving MRP-related issues
- [Data Formats](/architecture/data-formats.md) - MRP format details
- [Cost Optimization](/advanced/cost-optimization.md) - Cost reduction methods
