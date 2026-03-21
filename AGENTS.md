# KYAD Agent — Agent Instructions | Agent 指令说明

This is a **security monitoring skill** providing real-time AI agent monitoring, AML anti-fraud detection, and skill package vulnerability scanning.
这是一个**安全监控技能**，提供实时 AI Agent 监控、AML（反洗钱）反欺诈检测以及技能包漏洞扫描功能。

## Available Skills | 可用技能

| Skill (技能) | Purpose (用途) | When to Use (使用时机) |
|--------------|----------------|------------------------|
| kya-security-monitor | Multi-agent security monitoring & AML (多 Agent 安全监控与反洗钱) | User asks to monitor agent security, check address risk, scan skill packages, view risk scores, detect credential exposure, or analyze API call patterns (当用户要求监控 Agent 安全、检查地址风险、扫描技能包、查看风险评分、检测凭证泄露或分析 API 调用模式时) |

## Skill Discovery | 技能发现

Skills are in the `skills/` directory. Each skill contains a `SKILL.md` with:
技能存放在 `skills/` 目录下。每个技能都包含一个 `SKILL.md` 文件，包含以下内容：

- YAML frontmatter (name, description, metadata) / YAML 元数据（名称、描述、元数据）
- Full API reference with endpoints, parameters, and response schemas / 完整的 API 参考（端点、参数和响应结构）
- Operation flows and cross-skill workflows / 操作流程和跨技能工作流
- Edge cases and error handling / 边缘情况与错误处理

## Quick Start | 快速开始

```bash
# Install and start (安装并启动)
npm install && npm start

# Dashboard opens at http://localhost:3000 (控制台面板将在 3000 端口打开)
```

## Key Commands | 核心命令

```bash
# Check address risk (检查地址风险)
curl http://localhost:3000/api/aml/check/0x1234...?chain=ETH

# Scan a skill package (扫描技能包)
curl -X POST http://localhost:3000/api/scan -H "Content-Type: application/json" -d '{"path": "/path/to/skills"}'

# View all agents (查看所有 Agent)
curl http://localhost:3000/api/agents

# Get risk score (获取风险评分)
curl http://localhost:3000/api/agents/onchainos-skills/score
```
