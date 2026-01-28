# Responding to CRP

This explains how to effectively respond to CRP (Consultation Request Pack).

## What is CRP?

**CRP (Consultation Request Pack)** is a query document generated when an agent needs human judgment.

Agents generate CRP in the following situations:

- 🤔 **Ambiguous requirements**: Multiple interpretations possible
- ⚖️ **Trade-off decisions**: Options with pros and cons
- 🔒 **Security-related decisions**: Risk assessment needed
- 🏗️ **Architecture choices**: System design direction
- 📦 **Adding external dependencies**: Project policy verification

## CRP Notification

When a CRP is generated:

1. **Notification displayed** on web dashboard
2. **Terminal bell** sounds (if configured)
3. **System notification** (if configured)

Click "Respond Now" on the dashboard to navigate to the CRP page.

## CRP Structure

### Full Format

```json
{
  "crp_id": "crp-001",
  "created_at": "2024-01-26T14:35:00Z",
  "created_by": "refiner",
  "type": "clarification",
  "question": "What criteria should rate limiting be based on?",
  "context": "Briefing only specifies 'appropriate rate limiting'",
  "options": [
    {
      "id": "A",
      "label": "60 per minute per IP",
      "description": "Common API default",
      "risk": "low"
    },
    {
      "id": "B",
      "label": "100 per minute per user",
      "description": "Authenticated user basis",
      "risk": "authentication system required"
    },
    {
      "id": "C",
      "label": "Different limits per endpoint",
      "description": "Fine-grained control possible",
      "risk": "implementation complexity increases"
    }
  ],
  "recommendation": "A",
  "status": "pending"
}
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `question` | Core question |
| `context` | Background explanation of why this question is needed |
| `options` | Available options (2-4) |
| `recommendation` | Agent's recommended option |

### Option Structure

Each option has:

- `id`: Option identifier (A, B, C...)
- `label`: Brief title
- `description`: Detailed explanation
- `risk`: Risk level ("low", "medium", "high")

## How to Respond

### 1. Respond via Web UI

CRP page structure:

```
┌─────────────────────────────────────────────┐
│  Consultation Request          CRP-001      │
├─────────────────────────────────────────────┤
│                                              │
│  From: Refiner                               │
│  Question:                                   │
│  ┌─────────────────────────────────────────┐│
│  │ What criteria should rate limiting be   ││
│  │ based on?                                ││
│  │                                          ││
│  │ Context: Briefing only specifies         ││
│  │ 'appropriate rate limiting'              ││
│  └─────────────────────────────────────────┘│
│                                              │
│  Options:                                    │
│                                              │
│  ● A. 60 per minute per IP (Recommended)    │
│       Common API default / Risk: low         │
│                                              │
│  ○ B. 100 per minute per user               │
│       Authenticated user basis / Risk: medium│
│                                              │
│  ○ C. Different limits per endpoint         │
│       Fine-grained control / Risk: high      │
│                                              │
│  Additional Notes:                           │
│  ┌─────────────────────────────────────────┐│
│  │ Start with simple approach for MVP       ││
│  └─────────────────────────────────────────┘│
│                                              │
│  ☑ Apply this decision to future similar    │
│    cases                                     │
│                                              │
│  [Submit Decision]                           │
│                                              │
└─────────────────────────────────────────────┘
```

**Steps:**

1. **Select option**: Click radio button
2. **Write rationale** (optional): Write reason in "Additional Notes"
3. **Future application** (optional): Check "Apply to future"
4. **Submit**: Click "Submit Decision"

### 2. VCR Generation

Upon submission, a **VCR (Version Controlled Resolution)** is generated:

```json
{
  "vcr_id": "vcr-001",
  "crp_id": "crp-001",
  "created_at": "2024-01-26T14:40:00Z",
  "decision": "A",
  "rationale": "Start with simple approach for MVP",
  "additional_notes": "Plan to add per-user limits later",
  "applies_to_future": true
}
```

### 3. Agent Restart

After VCR generation:

1. The agent's context is initialized
2. Work resumes reflecting VCR content
3. Progress can be tracked on dashboard

## Response Guide by CRP Type

### Type: clarification

**Meaning:** Requirement clarification

**Example:**

```json
{
  "type": "clarification",
  "question": "How should user authentication be implemented?",
  "options": [
    {"id": "A", "label": "JWT", ...},
    {"id": "B", "label": "Session", ...},
    {"id": "C", "label": "OAuth 2.0", ...}
  ]
}
```

**Response Tips:**

- ✅ Consider existing project patterns
- ✅ Consider team's tech stack
- ✅ Consider future scalability

### Type: architecture

**Meaning:** Architecture decision

**Example:**

```json
{
  "type": "architecture",
  "question": "How should the database schema be designed?",
  "options": [
    {"id": "A", "label": "Normalized schema", ...},
    {"id": "B", "label": "Denormalized (performance first)", ...}
  ]
}
```

**Response Tips:**

- ✅ Consider performance vs maintainability trade-off
- ✅ Consider data scale
- ✅ Consider query patterns

### Type: security

**Meaning:** Security-related decision

**Example:**

```json
{
  "type": "security",
  "question": "How should user input be validated?",
  "options": [
    {"id": "A", "label": "Basic validation only", ...},
    {"id": "B", "label": "Strict validation + escaping", ...}
  ]
}
```

**Response Tips:**

- ⚠️ Approach conservatively (choose safer option)
- ⚠️ Consult experts if risk is high
- ✅ Verify regulatory compliance

### Type: dependency

**Meaning:** Adding external library

**Example:**

```json
{
  "type": "dependency",
  "question": "Should we add a library for date handling?",
  "options": [
    {"id": "A", "label": "Use day.js", ...},
    {"id": "B", "label": "Use native Date", ...}
  ]
}
```

**Response Tips:**

- ✅ Consider library size
- ✅ Check maintenance status
- ✅ Check license
- ✅ Check team policy

## Considerations When Responding

### 1. Review Recommendation

The agent's recommendation considers:

- General best practices
- Low risk
- Implementation complexity

However, it doesn't know **project specifics**, so don't follow blindly.

### 2. Risk Assessment

| Risk | Meaning | Consideration |
|------|---------|---------------|
| **Low** | Standard approach | Safe to choose |
| **Medium** | Additional work needed | Weigh cost vs benefit |
| **High** | Complexity/risk increases | Careful judgment needed |

### 3. Writing Rationale

Writing rationale provides:

- ✅ Future reference
- ✅ Shareable with team members
- ✅ Recorded in VCR history

**Good Rationale Examples:**

```
Starting with simple IP-based limits for MVP stage.
Plan to switch to per-user limits when authentication system is added.
```

**Bad Rationale Examples:**

```
This seems better
```

### 4. "Apply to future" Option

When checked:

- ✅ Automatically applied in similar situations
- ✅ Prevents repetitive CRPs
- ⚠️ Be careful as context may differ

**When to Check?**

- ✅ Consistent policies (e.g., naming conventions)
- ✅ Tech stack choices (e.g., always use JWT)
- ❌ Context-dependent decisions (e.g., specific API rate limit)

## Practical Examples

### Example 1: Rate Limiting

**CRP:**

```json
{
  "question": "What criteria should rate limiting be based on?",
  "options": [
    {"id": "A", "label": "60/min per IP", "risk": "low"},
    {"id": "B", "label": "100/min per user", "risk": "medium"},
    {"id": "C", "label": "Different per endpoint", "risk": "high"}
  ],
  "recommendation": "A"
}
```

**Response Example 1 (MVP):**

```
Decision: A
Rationale: Start with simple IP-based limits for MVP stage
Apply to future: No (may vary by situation)
```

**Response Example 2 (Production):**

```
Decision: B
Rationale: Per-user limit is more appropriate since authentication system already exists
Apply to future: Yes (apply same policy to future APIs)
```

### Example 2: Database Choice

**CRP:**

```json
{
  "question": "Please select a database",
  "options": [
    {"id": "A", "label": "PostgreSQL", "risk": "low"},
    {"id": "B", "label": "MongoDB", "risk": "medium"}
  ],
  "recommendation": "A"
}
```

**Response Example:**

```
Decision: A
Rationale:
- Project has relational data structure (User, Order, Product)
- Transactions needed
- Team has extensive PostgreSQL experience
Apply to future: Yes (use PostgreSQL for all future services)
```

### Example 3: Security Trade-off

**CRP:**

```json
{
  "question": "What level of XSS prevention should be applied?",
  "options": [
    {"id": "A", "label": "Basic escaping", "risk": "medium"},
    {"id": "B", "label": "Strict CSP + escaping", "risk": "low"}
  ],
  "recommendation": "B"
}
```

**Response Example:**

```
Decision: B
Rationale:
- Security priority since handling user-generated content
- CSP setup is complex but essential
Apply to future: Yes (same security policy for all pages)
```

## Checking VCR History

To check past decisions:

```bash
# All VCRs for specific Run
ls .dure/runs/{run_id}/vcr/

# Check VCR content
cat .dure/runs/{run_id}/vcr/vcr-001.json

# Search all VCRs
find .dure/runs -name "vcr-*.json" -exec cat {} \;
```

In the web UI, check the "Decisions" tab on the Run detail page.

## Common Mistakes

### ❌ Blindly Following Recommendation

Agents don't know project specifics. Always **consider context**.

### ❌ Not Writing Rationale

It will be hard to remember why you made that decision later.

### ❌ Checking "Apply to future" Carelessly

May be incorrectly applied to situations with different contexts.

### ❌ Leaving Unattended Too Long

The entire Run stops while CRP is pending. Respond quickly.

## Next Steps

- [Reviewing MRP](/guide/reviewing-mrp.md) - How to review final deliverables
- [Understanding Agents](/guide/understanding-agents.md) - Understanding CRP generation logic
- [Data Formats](/architecture/data-formats.md) - CRP/VCR format details
