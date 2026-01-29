# Changelog

Records all major changes to Dure.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and version management uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **TUI Dashboard**: Ink 기반 터미널 대시보드 (기본 UI)
  - 실시간 에이전트 상태 및 출력 표시
  - 풀스크린 모드 지원 (`f` 키)
  - CRP 인라인 응답 기능
  - 키바인딩: `q` 종료, `Tab` 패널 전환, `↑/↓` 스크롤
- **`dure monitor` 명령어**: 실행 중인 run 모니터링
  - TUI 모드 (기본)
  - Web 모드 (`--web` 옵션)
- **Web Dashboard Socket.io API**: 실시간 대시보드 업데이트
  - `/dashboard` 네임스페이스
  - `dashboard:subscribe`, `dashboard:update`, `dashboard:crp` 이벤트
- **DashboardDataProvider**: 대시보드 데이터 집계 레이어
  - 폴링 기반 상태 업데이트 (500ms)
  - EventEmitter 패턴 구독
- **Custom Skills**: `/new-agent`, `/new-command`, `/add-event`, `/new-manager`
- **Custom Agents**: `reviewer`, `tester`, `security`, `refactorer`, `documenter`
- Documentation site added (Docsify)
- GitHub Pages deployment workflow

### Changed
- `dure start`: TUI 대시보드가 기본 모드로 변경
  - `--web`: 웹 대시보드 모드
  - `--attach`: tmux 세션 연결 (레거시)
- 에이전트 실행: 헤드리스 모드 지원 강화

### Documentation
- Socket Events Reference 추가 (`docs/api/socket-events.md`)
- Dashboard System Architecture 추가 (`docs/architecture/dashboard-system.md`)
- Monitoring Dashboard Guide 추가 (`docs/guide/monitoring-dashboard.md`)
- CLI Reference 업데이트 (`dure start`, `dure monitor`)
- API Reference 업데이트 (Socket.io 이벤트, Dashboard API)

## [0.1.0] - 2024-01-26

### Added
- ✨ 4-agent pipeline (Refiner, Builder, Verifier, Gatekeeper)
- 🌐 Web dashboard (real-time status monitoring)
- 📊 CRP (Consultation Request Pack) system
- 📦 MRP (Merge-Readiness Pack) generation
- 🔄 Auto-retry mechanism
- 📈 Token usage tracking (ccusage integration)
- ⚙️ Per-agent configuration files
- 🎯 Phase-based execution flow
- 📝 Event logging system
- 🔔 WebSocket real-time notifications

### CLI
- `dure start` - Start Dure
- `dure status` - Check current status
- `dure stop` - Stop Run
- `dure history` - Past Run list
- `dure logs` - View logs
- `dure clean` - Clean up old Runs
- `dure config` - Configuration management

### Documentation
- Quick start guide
- Briefing writing guide
- Understanding agents
- CRP response guide
- MRP review guide
- Troubleshooting guide
- Architecture documentation
- API reference

### Known Issues
- Only one project can run at a time
- Auto-merge not supported (manual copy required)
- CI/CD integration not supported
- Custom prompts not supported

## [0.0.1] - 2024-01-20

### Added
- Initial prototype
- Basic agent execution
- tmux integration
- Simple CLI

---

## Future Plans

### [0.2.0] - Planned

#### Planned Features
- 🔄 Auto-merge functionality
- 🔗 Improved Git integration
- 📊 Better usage reports
- 🎨 UI improvements
- 🐛 Bug fixes and stability improvements

### [0.3.0] - Planned

#### Planned Features
- 🤖 Custom agent support
- 📝 Prompt template customization
- 🔌 Plugin system
- 🌍 Multi-language support

### [1.0.0] - Planned

#### Planned Features
- 🏢 Multi-project support
- 🔄 CI/CD integration
- ☁️ Cloud version
- 🤝 Collaboration features
- 📈 Advanced analytics

---

## Change Categories

- `Added`: New features
- `Changed`: Changes to existing features
- `Deprecated`: Features to be removed soon
- `Removed`: Removed features
- `Fixed`: Bug fixes
- `Security`: Security-related fixes

---

Full change history can be found at [GitHub Releases](https://github.com/choo121600/dure/releases).
