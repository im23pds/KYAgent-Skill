# KYAD Agent — Agent Instructions

This is a **security monitoring skill** providing real-time AI agent monitoring, AML anti-fraud detection, and skill package vulnerability scanning.

## Available Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| kya-security-monitor | Multi-agent security monitoring & AML | User asks to monitor agent security, check address risk, scan skill packages, view risk scores, detect credential exposure, or analyze API call patterns |

## Skill Discovery

Skills are in the `skills/` directory. Each skill contains a `SKILL.md` with:

- YAML frontmatter (name, description, metadata)
- Full API reference with endpoints, parameters, and response schemas
- Operation flows and cross-skill workflows
- Edge cases and error handling

## Quick Start

```bash
# Install and start
npm install && npm start

# Dashboard opens at http://localhost:3000
```

## Key Commands

```bash
# Check address risk
curl http://localhost:3000/api/aml/check/0x1234...?chain=ETH

# Scan a skill package
curl -X POST http://localhost:3000/api/scan -H "Content-Type: application/json" -d '{"path": "/path/to/skills"}'

# View all agents
curl http://localhost:3000/api/agents

# Get risk score
curl http://localhost:3000/api/agents/onchainos-skills/score
```
