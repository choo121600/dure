# 변경 로그

Dure의 모든 주요 변경 사항을 기록합니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 따르며,
버전 관리는 [Semantic Versioning](https://semver.org/lang/ko/)을 사용합니다.

## [Unreleased]

### Added
- 문서 사이트 추가 (Docsify)
- GitHub Pages 배포 워크플로우

## [0.1.0] - 2024-01-26

### Added
- ✨ 4개 에이전트 파이프라인 (Refiner, Builder, Verifier, Gatekeeper)
- 🌐 웹 대시보드 (실시간 상태 모니터링)
- 📊 CRP(Consultation Request Pack) 시스템
- 📦 MRP(Merge-Readiness Pack) 생성
- 🔄 자동 재시도 메커니즘
- 📈 토큰 사용량 추적 (ccusage 통합)
- ⚙️ 에이전트별 설정 파일
- 🎯 Phase 기반 실행 흐름
- 📝 이벤트 로깅 시스템
- 🔔 WebSocket 실시간 알림

### CLI
- `dure start` - Dure 시작
- `dure status` - 현재 상태 확인
- `dure stop` - Run 중지
- `dure history` - 과거 Run 목록
- `dure logs` - 로그 조회
- `dure clean` - 오래된 Run 정리
- `dure config` - 설정 관리

### 문서
- 빠른 시작 가이드
- Briefing 작성 가이드
- 에이전트 이해하기
- CRP 응답 가이드
- MRP 검토 가이드
- 문제 해결 가이드
- 아키텍처 문서
- API 레퍼런스

### Known Issues
- 한 번에 하나의 프로젝트만 실행 가능
- 자동 머지 미지원 (수동 복사 필요)
- CI/CD 통합 미지원
- 커스텀 프롬프트 미지원

## [0.0.1] - 2024-01-20

### Added
- 초기 프로토타입
- 기본 에이전트 실행
- tmux 통합
- 간단한 CLI

---

## 향후 계획

### [0.2.0] - 예정

#### 계획된 기능
- 🔄 자동 머지 기능
- 🔗 Git 통합 개선
- 📊 더 나은 Usage 리포트
- 🎨 UI 개선
- 🐛 버그 수정 및 안정성 개선

### [0.3.0] - 예정

#### 계획된 기능
- 🤖 커스텀 에이전트 지원
- 📝 프롬프트 템플릿 커스터마이징
- 🔌 플러그인 시스템
- 🌍 다국어 지원

### [1.0.0] - 예정

#### 계획된 기능
- 🏢 멀티 프로젝트 지원
- 🔄 CI/CD 통합
- ☁️ 클라우드 버전
- 🤝 협업 기능
- 📈 고급 분석

---

## 변경 사항 카테고리

- `Added`: 새로운 기능
- `Changed`: 기존 기능 변경
- `Deprecated`: 곧 제거될 기능
- `Removed`: 제거된 기능
- `Fixed`: 버그 수정
- `Security`: 보안 관련 수정

---

전체 변경 이력은 [GitHub Releases](https://github.com/yourusername/dure/releases)에서 확인할 수 있습니다.
