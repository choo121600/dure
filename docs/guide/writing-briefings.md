# Briefing Writing Guide

Learn how to write effective Briefings.

## What is a Briefing?

A Briefing is a **requirements specification written by humans**. It is written in Markdown format, and the Refiner agent reads it first.

Good Briefings are:
- ✅ Clear and specific
- ✅ Constraints are specified
- ✅ Expected behavior is defined
- ❌ No ambiguous expressions
- ❌ Don't force implementation details

## Basic Structure

Recommended Briefing structure:

```markdown
# [Task Title]

## Requirements
- [Required Feature 1]
- [Required Feature 2]
- [Required Feature 3]

## Constraints
- [Technical constraints]
- [Library constraints]
- [Performance constraints]

## Expected Behavior
[Input] → [Output]
[Input] → [Output]

## Notes (Optional)
- [Additional context]
```

## Good Examples

### Example 1: API Endpoint

```markdown
# User Registration API Implementation

## Requirements
- Create POST /api/users endpoint
- Input: email, password, name
- Output: userId, token (JWT)
- Password hashing (using bcrypt)
- Duplicate email check

## Constraints
- Use Express.js framework
- PostgreSQL database
- JWT validity period: 7 days
- Password minimum 8 characters, letters+numbers combination required

## Expected Behavior
**Success:**
```json
POST /api/users
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}

→ 201 Created
{
  "userId": "uuid-123",
  "token": "jwt-token"
}
```

**Failure (Duplicate email):**
```json
→ 409 Conflict
{
  "error": "Email already exists"
}
```

**Failure (Weak password):**
```json
→ 400 Bad Request
{
  "error": "Password must be at least 8 characters with letters and numbers"
}
```

## Notes
- For existing User model, refer to src/models/User.ts
- JWT secret uses environment variable JWT_SECRET
```

### Example 2: Utility Function

```markdown
# Date Formatter Utility

## Requirements
- Create `formatDate` function
- Parameters: date (Date | string), format (string)
- Supported formats:
  - "YYYY-MM-DD" → "2024-01-26"
  - "YYYY/MM/DD" → "2024/01/26"
  - "DD.MM.YYYY" → "26.01.2024"
  - "relative" → "2 days ago", "3 hours ago" etc.

## Constraints
- Implement in TypeScript
- No external libraries (date-fns, moment, etc.)
- Write in src/utils/date.ts file
- Include type definitions

## Expected Behavior
```typescript
formatDate(new Date("2024-01-26"), "YYYY-MM-DD")
→ "2024-01-26"

formatDate("2024-01-26T10:30:00", "DD.MM.YYYY")
→ "26.01.2024"

formatDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), "relative")
→ "2 days ago"

formatDate(new Date(Date.now() - 3 * 60 * 60 * 1000), "relative")
→ "3 hours ago"

formatDate("invalid", "YYYY-MM-DD")
→ throw Error("Invalid date")
```

## Notes
- For relative format, if less than 1 minute show "just now"
```

### Example 3: Refactoring

```markdown
# User Service Refactoring

## Requirements
- Refactor createUser function in src/services/UserService.ts
- Apply Single Responsibility Principle
- Separate the following features into separate functions:
  - Email validation
  - Password validation
  - Duplicate user check
  - Password hashing
  - User DB save

## Constraints
- Maintain existing API interface (compatibility)
- Maintain TypeScript type safety
- Guarantee existing tests pass

## Expected Behavior
Same as existing behavior, but code should be more readable and testable

**Existing code (refactoring target):**
```typescript
async createUser(email: string, password: string, name: string) {
  // 100 lines of complex logic...
}
```

**After refactoring:**
```typescript
async createUser(email: string, password: string, name: string) {
  this.validateEmail(email);
  this.validatePassword(password);
  await this.checkDuplicateUser(email);
  const hashedPassword = await this.hashPassword(password);
  return await this.saveUser({ email, password: hashedPassword, name });
}
```

## Notes
- Existing tests: src/services/UserService.test.ts
- Tests for separated functions also need to be added
```

## Bad Examples and Improvements

### ❌ Bad Example 1: Ambiguous Expressions

```markdown
# Login Feature Improvement

## Requirements
- Apply appropriate security
- Performance optimization
- Improve user experience
```

**Problems:**
- Unclear what "appropriate" means → Triggers CRP
- No specific requirements
- No measurable criteria

### ✅ Improved Example 1

```markdown
# Login Security Enhancement

## Requirements
- Lock account for 15 minutes after 5 login failures
- Add CSRF token verification
- Require email verification for password reset
- Log login success/failure

## Constraints
- Use Redis (store account lock status)
- Email: Use SendGrid API
- CSRF: Use csurf middleware

## Expected Behavior
**5 login failures:**
```json
POST /api/login
→ 429 Too Many Requests
{
  "error": "Account locked. Try again in 15 minutes."
}
```

**No CSRF token:**
```json
POST /api/login
→ 403 Forbidden
{
  "error": "Invalid CSRF token"
}
```
```

### ❌ Bad Example 2: Forcing Implementation Details

```markdown
# Data Storage

## Requirements
- Use MongoDB Atlas
- Define Mongoose schema
- Connection pooling 10
- Create indexes on email and createdAt
```

**Problems:**
- Over-specifying implementation method
- No room for agent judgment
- No "why"

### ✅ Improved Example 2

```markdown
# User Data Persistence

## Requirements
- Store and query User data
- Fields: id, email (unique), name, createdAt
- Need fast email lookup (< 10ms)
- Need to query recently registered users

## Constraints
- Existing project uses MongoDB
- Define model in src/models/User.ts

## Expected Behavior
**Save:**
```typescript
await userModel.create({
  email: "user@example.com",
  name: "John"
})
```

**Email lookup:**
```typescript
await userModel.findByEmail("user@example.com")
→ { id, email, name, createdAt }
```

**Recent 10 registrations:**
```typescript
await userModel.findRecent(10)
→ [{ id, email, name, createdAt }, ...]
```

## Notes
- Consider index since email lookup is frequent
```

## Expressions to Avoid

The following expressions **trigger CRP**. Replace with specific values:

| Ambiguous Expression | Specific Expression |
|---------------------|---------------------|
| "appropriately", "as needed" | "60/minute", "10 seconds" |
| "appropriate", "reasonable" | "8 or more characters", "1MB or less" |
| "if needed", "if possible" | Explicitly indicate whether required |
| "quickly", "slowly" | "within 100ms", "more than 3 seconds" |
| "many", "few" | "1000", "10" |

## Specificity Checklist

Check the following after writing your Briefing:

- [ ] Are all numbers specific? ("appropriate" → "60")
- [ ] Are all constraints specified?
- [ ] Is expected behavior defined with input/output?
- [ ] Are error cases included?
- [ ] Are file paths specified?
- [ ] If existing code reference is needed, is the path provided?

## When is it OK to be Ambiguous?

In the following cases, you can **intentionally be ambiguous** to get agent judgment:

### 1. When You Want to Present Multiple Options

```markdown
## Requirements
- Apply rate limiting
- Criteria: IP or user ID (choose appropriate method)
```

→ Refiner generates CRP with options

### 2. When You Want to Follow Best Practices

```markdown
## Requirements
- Error handling (apply Node.js best practices)
```

→ Agent applies standard patterns

### 3. When You Want to Follow Project Conventions

```markdown
## Requirements
- File location: Match existing project structure
- Naming: Follow project conventions
```

→ Agent analyzes existing patterns and applies

## Writing Complex Requirements

### Multiple File Modifications

```markdown
# Add Authentication System

## Requirements
1. **User Model** (src/models/User.ts)
   - Fields: id, email, passwordHash, role
   - Methods: comparePassword, generateToken

2. **Auth Middleware** (src/middleware/auth.ts)
   - JWT token verification
   - Inject user info to req.user
   - Permission check (role-based)

3. **Auth Routes** (src/routes/auth.ts)
   - POST /api/auth/register
   - POST /api/auth/login
   - POST /api/auth/refresh

4. **Environment Variables**
   - JWT_SECRET
   - JWT_EXPIRES_IN

## Constraints
- Express.js + TypeScript
- PostgreSQL + Prisma
- bcrypt (password hashing)
- jsonwebtoken (JWT)

## Expected Behavior
[Detailed behavior per endpoint...]
```

### Migration/Data Transformation

```markdown
# User Table Migration

## Requirements
- Change `username` field to `email`
- Transform existing data: username → email (domain is @legacy.com)
- Maintain NOT NULL constraint

## Constraints
- Using PostgreSQL
- Must not lose existing 1000 users' data
- Minimize downtime

## Expected Behavior
**Before migration:**
```sql
SELECT username FROM users LIMIT 1;
→ "john_doe"
```

**After migration:**
```sql
SELECT email FROM users WHERE id = 1;
→ "john_doe@legacy.com"
```

## Notes
- Migration script: Create in migrations/ folder
- Also write rollback script
```

## Next Steps

- [Understanding Agents](/guide/understanding-agents.md) - How Refiner processes Briefings
- [Responding to CRP](/guide/responding-to-crp.md) - What to do when CRP is generated
- [Example Collection](/misc/examples.md) - More Briefing examples
