# Changelog

Records all major changes to Dure.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and version management uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Documentation site added (Docsify)
- GitHub Pages deployment workflow

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

Full change history can be found at [GitHub Releases](https://github.com/yourusername/dure/releases).
