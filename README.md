# KYA — Know Your Agent 🛡️

> Real-time multi-agent AI security monitoring, AML risk assessment, and anti-fraud detection.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)

## Features

- 🔍 **Multi-Agent Monitoring** — Track multiple AI agents with real-time dashboards
- 🛡️ **Skill Package Scanner** — Detect credential exposure & prompt injection risks
- 📊 **4D Risk Scoring** — Credential · Behavior · Transaction · Chain dimensions
- 🔒 **AML Anti-Fraud** — Address risk checking (400M+ addresses, 19 blockchains)
- ⚡ **Real-time Alerts** — WebSocket-powered live event streaming
- 📱 **Mobile-Ready** — Responsive UI optimized for phone status checking
- ⛓️ **Chain Monitor** — On-chain event tracking for suspicious transactions

## Installation

### Via ClawHub (Recommended)

```bash
npx skills add 23pds/KYAgent-Skill
```

### Manual

```bash
git clone https://github.com/23pds/KYAgent-Skill.git
cd kya-agent
npm install
npm start
```

Dashboard: `http://localhost:3000`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Set `production` for caching & optimizations |
| `ONCHAINOS_PATH` | `../onchainos-skills` | Path to agent skill packages to scan |
| `MISTTRACK_API_KEY` | — | MistTrack API key (optional, uses simulation if not set) |

## API Quick Reference

```bash
# List monitored agents
curl http://localhost:3000/api/agents

# Check address AML risk
curl http://localhost:3000/api/aml/check/0x1234...?chain=ETH

# Scan a skill package
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/skills"}'

# Get agent risk score
curl http://localhost:3000/api/agents/onchainos-skills/score
```

## Architecture

```
kya-agent/
├── server.js              # Main entry (Express + WebSocket)
├── public/                # Dashboard (HTML/CSS/JS)
├── skills/                # Skill definition (SKILL.md)
├── src/
│   ├── aml/               # AML anti-fraud engine
│   ├── chain/             # On-chain activity monitor
│   ├── db/                # SQLite database
│   ├── risk/              # Risk scoring engine
│   ├── scanner/           # Skill package scanner
│   └── simulator/         # Multi-agent simulator
├── .claude-plugin/        # Claude Code integration
├── .cursor-plugin/        # Cursor integration
└── AGENTS.md              # Agent discovery document
```

## License

Apache-2.0 © [23pds](https://github.com/im23pds)

## Powered by

Built with ❤️ by 23pds
