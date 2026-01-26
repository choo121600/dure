# Briefing 작성 가이드

효과적인 Briefing을 작성하는 방법을 배웁니다.

## Briefing이란?

Briefing은 **인간이 작성하는 요구사항 명세서**입니다. Markdown 형식으로 작성하며, Refiner 에이전트가 가장 먼저 읽습니다.

좋은 Briefing은:
- ✅ 명확하고 구체적
- ✅ 제약 조건이 명시됨
- ✅ 예상 동작이 정의됨
- ❌ 모호한 표현이 없음
- ❌ 구현 세부사항을 강요하지 않음

## 기본 구조

권장하는 Briefing 구조입니다:

```markdown
# [작업 제목]

## 요구사항
- [필수 기능 1]
- [필수 기능 2]
- [필수 기능 3]

## 제약 조건
- [기술 제약]
- [라이브러리 제약]
- [성능 제약]

## 예상 동작
[입력] → [출력]
[입력] → [출력]

## 참고 사항 (선택)
- [추가 컨텍스트]
```

## 좋은 예시

### 예시 1: API 엔드포인트

```markdown
# User Registration API 구현

## 요구사항
- POST /api/users 엔드포인트 생성
- 입력: email, password, name
- 출력: userId, token (JWT)
- 비밀번호 해싱 (bcrypt 사용)
- 중복 이메일 체크

## 제약 조건
- Express.js 프레임워크 사용
- PostgreSQL 데이터베이스
- JWT 유효 기간: 7일
- 비밀번호 최소 8자, 영문+숫자 조합 필수

## 예상 동작
**성공:**
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

**실패 (중복 이메일):**
```json
→ 409 Conflict
{
  "error": "Email already exists"
}
```

**실패 (약한 비밀번호):**
```json
→ 400 Bad Request
{
  "error": "Password must be at least 8 characters with letters and numbers"
}
```

## 참고 사항
- 기존 User 모델은 src/models/User.ts 참고
- JWT 시크릿은 환경 변수 JWT_SECRET 사용
```

### 예시 2: 유틸리티 함수

```markdown
# Date Formatter 유틸리티

## 요구사항
- `formatDate` 함수 생성
- 파라미터: date (Date | string), format (string)
- 지원 포맷:
  - "YYYY-MM-DD" → "2024-01-26"
  - "YYYY/MM/DD" → "2024/01/26"
  - "DD.MM.YYYY" → "26.01.2024"
  - "relative" → "2 days ago", "3 hours ago" 등

## 제약 조건
- TypeScript로 구현
- 외부 라이브러리 사용 금지 (date-fns, moment 등)
- src/utils/date.ts 파일에 작성
- 타입 정의 포함

## 예상 동작
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

## 참고 사항
- relative 포맷은 1분 미만이면 "just now"
```

### 예시 3: 리팩토링

```markdown
# User Service 리팩토링

## 요구사항
- src/services/UserService.ts 의 createUser 함수 리팩토링
- 단일 책임 원칙 적용
- 다음 기능을 별도 함수로 분리:
  - 이메일 유효성 검사
  - 비밀번호 유효성 검사
  - 중복 사용자 체크
  - 비밀번호 해싱
  - 사용자 DB 저장

## 제약 조건
- 기존 API 인터페이스 유지 (호환성)
- TypeScript 타입 안전성 유지
- 기존 테스트 통과 보장

## 예상 동작
기존 동작과 동일하되, 코드가 더 읽기 쉽고 테스트 가능해야 함

**기존 코드 (리팩토링 대상):**
```typescript
async createUser(email: string, password: string, name: string) {
  // 100줄의 복잡한 로직...
}
```

**리팩토링 후:**
```typescript
async createUser(email: string, password: string, name: string) {
  this.validateEmail(email);
  this.validatePassword(password);
  await this.checkDuplicateUser(email);
  const hashedPassword = await this.hashPassword(password);
  return await this.saveUser({ email, password: hashedPassword, name });
}
```

## 참고 사항
- 기존 테스트: src/services/UserService.test.ts
- 분리된 함수들도 테스트 추가 필요
```

## 나쁜 예시와 개선

### ❌ 나쁜 예시 1: 모호한 표현

```markdown
# 로그인 기능 개선

## 요구사항
- 적절한 보안 적용
- 성능 최적화
- 사용자 경험 개선
```

**문제점:**
- "적절한"이 무엇인지 불명확 → CRP 트리거
- 구체적인 요구사항 없음
- 측정 가능한 기준 없음

### ✅ 개선된 예시 1

```markdown
# 로그인 보안 강화

## 요구사항
- 로그인 실패 5회 시 계정 15분 잠금
- CSRF 토큰 검증 추가
- 비밀번호 재설정 시 이메일 인증 필수
- 로그인 성공/실패 로그 기록

## 제약 조건
- Redis 사용 (계정 잠금 상태 저장)
- 이메일: SendGrid API 사용
- CSRF: csurf 미들웨어 사용

## 예상 동작
**로그인 실패 5회:**
```json
POST /api/login
→ 429 Too Many Requests
{
  "error": "Account locked. Try again in 15 minutes."
}
```

**CSRF 토큰 없음:**
```json
POST /api/login
→ 403 Forbidden
{
  "error": "Invalid CSRF token"
}
```
```

### ❌ 나쁜 예시 2: 구현 세부사항 강요

```markdown
# 데이터 저장

## 요구사항
- MongoDB Atlas 사용
- Mongoose 스키마 정의
- connection pooling 10개
- 인덱스는 email과 createdAt에 생성
```

**문제점:**
- 구현 방법을 과도하게 지정
- 에이전트의 판단 여지가 없음
- "왜"가 없음

### ✅ 개선된 예시 2

```markdown
# User 데이터 영속화

## 요구사항
- User 데이터 저장 및 조회
- 필드: id, email (unique), name, createdAt
- 이메일로 빠른 조회 필요 (< 10ms)
- 최근 가입 사용자 조회 필요

## 제약 조건
- 기존 프로젝트가 MongoDB 사용 중
- src/models/User.ts 에 모델 정의

## 예상 동작
**저장:**
```typescript
await userModel.create({
  email: "user@example.com",
  name: "John"
})
```

**이메일 조회:**
```typescript
await userModel.findByEmail("user@example.com")
→ { id, email, name, createdAt }
```

**최근 가입자 10명:**
```typescript
await userModel.findRecent(10)
→ [{ id, email, name, createdAt }, ...]
```

## 참고 사항
- 이메일 조회가 자주 발생하므로 인덱스 고려
```

## 피해야 할 표현

다음 표현들은 **CRP를 트리거**합니다. 구체적인 값으로 대체하세요:

| 모호한 표현 | 구체적인 표현 |
|------------|--------------|
| "적당히", "알아서" | "60회/분", "10초" |
| "적절한", "합리적인" | "8자 이상", "1MB 이하" |
| "필요하면", "가능하면" | 명시적으로 필수 여부 표시 |
| "빠르게", "느리게" | "100ms 이내", "3초 이상" |
| "많이", "적게" | "1000개", "10개" |

## 구체성 체크리스트

Briefing 작성 후 다음을 확인하세요:

- [ ] 모든 숫자가 구체적인가? ("적절한" → "60")
- [ ] 모든 제약 조건이 명시되었는가?
- [ ] 예상 동작이 입출력으로 정의되었는가?
- [ ] 에러 케이스가 포함되었는가?
- [ ] 파일 경로가 명시되었는가?
- [ ] 기존 코드 참고가 필요하면 경로를 제공했는가?

## 언제 모호하게 써도 되는가?

다음 경우에는 **의도적으로 모호하게** 작성하여 에이전트의 판단을 받을 수 있습니다:

### 1. 여러 선택지를 제시하고 싶을 때

```markdown
## 요구사항
- Rate limiting 적용
- 기준: IP 또는 사용자 ID (적절한 방법 선택)
```

→ Refiner가 CRP 생성하여 옵션 제시

### 2. 베스트 프랙티스를 따르고 싶을 때

```markdown
## 요구사항
- 에러 핸들링 (Node.js 베스트 프랙티스 적용)
```

→ 에이전트가 표준적인 패턴 적용

### 3. 프로젝트 컨벤션을 따르고 싶을 때

```markdown
## 요구사항
- 파일 위치: 기존 프로젝트 구조에 맞게
- 네이밍: 프로젝트 컨벤션 준수
```

→ 에이전트가 기존 패턴 분석 후 적용

## 복잡한 요구사항 작성

### 여러 파일 수정

```markdown
# Authentication 시스템 추가

## 요구사항
1. **User 모델** (src/models/User.ts)
   - 필드: id, email, passwordHash, role
   - 메서드: comparePassword, generateToken

2. **Auth 미들웨어** (src/middleware/auth.ts)
   - JWT 토큰 검증
   - req.user에 사용자 정보 주입
   - 권한 체크 (role 기반)

3. **Auth Routes** (src/routes/auth.ts)
   - POST /api/auth/register
   - POST /api/auth/login
   - POST /api/auth/refresh

4. **Environment 변수**
   - JWT_SECRET
   - JWT_EXPIRES_IN

## 제약 조건
- Express.js + TypeScript
- PostgreSQL + Prisma
- bcrypt (비밀번호 해싱)
- jsonwebtoken (JWT)

## 예상 동작
[각 엔드포인트별 상세 동작...]
```

### 마이그레이션/데이터 변환

```markdown
# User 테이블 마이그레이션

## 요구사항
- `username` 필드를 `email`로 변경
- 기존 데이터 변환: username → email (도메인은 @legacy.com)
- NOT NULL 제약조건 유지

## 제약 조건
- PostgreSQL 사용
- 기존 사용자 1000명 데이터 유실 없어야 함
- 다운타임 최소화

## 예상 동작
**마이그레이션 전:**
```sql
SELECT username FROM users LIMIT 1;
→ "john_doe"
```

**마이그레이션 후:**
```sql
SELECT email FROM users WHERE id = 1;
→ "john_doe@legacy.com"
```

## 참고 사항
- 마이그레이션 스크립트: migrations/ 폴더에 생성
- 롤백 스크립트도 함께 작성
```

## 다음 단계

- [에이전트 이해하기](/guide/understanding-agents.md) - Refiner가 Briefing을 처리하는 방법
- [CRP 응답](/guide/responding-to-crp.md) - CRP가 생성되었을 때 대처법
- [예제 모음](/misc/examples.md) - 더 많은 Briefing 예시
