# KYAD — Know Your Agent Doing

> Real-time multi-agent AI security monitoring, AML risk assessment, and anti-fraud detection.
>
> 面向多 AI Agent 的实时安全监控、反洗钱(AML)风险评估与反欺诈检测系统。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)

## Features | 功能特性

- 🔍 **Multi-Agent Monitoring | 多 Agent 监控** — Track multiple AI agents with real-time dashboards (通过实时看板追踪多个 AI Agent)
- 🛡️ **Skill Package Scanner | 技能包扫描** — Detect credential exposure & prompt injection risks (检测凭证泄露与提示词注入风险)
- 📊 **4D Risk Scoring | 4D 风险评分** — Credential · Behavior · Transaction · Chain dimensions (凭证·行为·交易·链上四维评分)
- 🔒 **AML Anti-Fraud | 反洗钱反欺诈** — Address risk checking (400M+ addresses, 19 blockchains) (地址风险检查，支持超4亿地址和19条链)
- ⚡ **Real-time Alerts | 实时告警** — WebSocket-powered live event streaming (基于 WebSocket 的实时事件流)
- 📱 **Mobile-Ready | 移动端适配** — Responsive UI optimized for phone status checking (响应式 UI，支持手机随时查看状态)
- ⛓️ **Chain Monitor | 链上监控** — On-chain event tracking for suspicious transactions (链上可疑交易事件追踪)

  <img width="577" height="759" alt="Snipaste_2026-03-21-00" src="https://github.com/user-attachments/assets/f9b8071f-9094-4747-b354-5cc37bd008e0" />


## Installation | 安装指南

### Via ClawHub (Recommended | 推荐)

```bash
npx skills add 23pds/KYAD-Skill
```

### Manual | 手动安装

```bash
git clone https://github.com/23pds/KYAD-Skill.git
cd kya-agent
npm install
npm start
```

Dashboard (控制台): `http://localhost:3000`

## Environment Variables | 环境变量

| Variable (变量) | Default (默认值) | Description (说明) |
|-----------------|------------------|--------------------|
| `PORT` | `3000` | Server port (服务端口) |
| `NODE_ENV` | `development` | Set `production` for caching & optimizations (设置为 production 可开启生产模式) |
| `ONCHAINOS_PATH` | `../onchainos-skills` | Path to agent skill packages to scan (待扫描的 Agent 技能包路径) |
| `MISTTRACK_API_KEY` | — | MistTrack API key (optional, uses simulation if not set) (慢雾 MistTrack API 密钥，不填则使用模拟模式) |

## API Quick Reference | API 快速参考

```bash
# List monitored agents (列出受监控的 Agent)
curl http://localhost:3000/api/agents

# Check address AML risk (检查地址 AML 风险)
curl http://localhost:3000/api/aml/check/0x1234...?chain=ETH

# Scan a skill package (扫描技能包)
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/skills"}'

# Get agent risk score (获取 Agent 风险评分)
curl http://localhost:3000/api/agents/onchainos-skills/score
```

## Architecture | 架构设计

```
kya-agent/
├── server.js              # Main entry (Express + WebSocket) / 主入口
├── public/                # Dashboard (HTML/CSS/JS) / 控制台前端
├── skills/                # Skill definition (SKILL.md) / 技能定义
├── src/
│   ├── aml/               # AML anti-fraud engine / 反洗钱反欺诈引擎
│   ├── chain/             # On-chain activity monitor / 链上活动监控
│   ├── db/                # SQLite database / SQLite 数据库
│   ├── risk/              # Risk scoring engine / 风险打分引擎
│   ├── scanner/           # Skill package scanner / 技能包扫描器
│   └── simulator/         # Multi-agent simulator / 多 Agent 模拟器
├── .claude-plugin/        # Claude Code integration / Claude Code 集成
├── .cursor-plugin/        # Cursor integration / Cursor 集成
└── AGENTS.md              # Agent discovery document / Agent 发现文档
```

## License | 开源协议

Apache-2.0 © [23pds](https://github.com/im23pds)

## Powered by

Built with ❤️ by 23pds
