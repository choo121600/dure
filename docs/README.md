# Dure Documentation

This is the official documentation for the Dure project.

## Viewing Locally

```bash
# Install Docsify CLI
npm install -g docsify-cli

# Run documentation server
docsify serve docs

# Access http://localhost:3000 in browser
```

## Documentation Structure

- `guide/` - Usage guides
  - [Getting Started](guide/getting-started.md)
  - [Monitoring Dashboard](guide/monitoring-dashboard.md) - TUI and Web dashboard usage
  - [Writing Briefings](guide/writing-briefings.md)
  - [Troubleshooting](guide/troubleshooting.md)
- `architecture/` - Architecture documentation
  - [System Architecture](architecture.md)
  - [Dashboard System](architecture/dashboard-system.md) - Real-time monitoring architecture
  - [File Structure](architecture/file-structure.md)
- `api/` - API reference
  - [API Overview](api.md)
  - [CLI Commands](api/cli.md)
  - [Socket Events](api/socket-events.md) - Socket.io event reference
  - [Configuration](api/configuration.md)
- `advanced/` - Advanced topics
- `misc/` - FAQ, contributing guide, changelog

## Contributing

If you'd like to contribute to documentation improvements, please refer to the [Contributing Guide](misc/contributing.md).

## Deployment

This documentation is automatically deployed to GitHub Pages.

For details, see the [Deployment Guide](deployment.md).
