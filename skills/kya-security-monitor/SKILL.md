---
name: kya-security-monitor
description: "This skill should be used when the user asks to 'monitor AI agent security', 'check agent risk score', 'scan an agent skill package for vulnerabilities', 'run AML check on an address', 'detect credential exposure', 'analyze agent API call patterns', 'check if an address is flagged', 'monitor on-chain activity', 'assess agent behavior risk', or mentions security monitoring, AML anti-fraud, risk assessment, credential scanning, prompt injection detection, or agent behavior analysis. KYA (Know Your Agent) is a real-time multi-agent security monitoring system with AML integration. Do NOT use for general programming questions or non-security topics."
license: Apache-2.0
metadata:
  author: 23pds
  version: "2.1.0"
  homepage: "https://github.com/23pds/KYAgent-Skill"
---

# KYA — Know Your Agent 🛡️

Real-time multi-agent AI security monitoring with AML anti-fraud detection.

## Auto-Discovery (Key Feature)

KYA **automatically discovers** all installed Agent/Skill packages on the user's system at startup.

**What it scans:**
- Sibling directories to kya-agent (same parent folder)
- Home directory plugin locations (`~/.claude/plugins/`, `~/.cursor/plugins/`)
- Paths specified via `ONCHAINOS_PATH` or `KYA_SCAN_PATHS` env vars
- Current working directory children

**Detection markers** (any one triggers recognition):
- Has `skills/*/SKILL.md` files
- Has `.claude-plugin/` or `.cursor-plugin/` directory
- Has `AGENTS.md` file
- `package.json` contains keywords like `skills`, `claude-code`, `agent`

Users do NOT need to configure anything — KYA finds all installed skills automatically.

## Prerequisites

Start KYA server before using commands:

```bash
cd kya-agent && npm install && npm start
```

Server starts, auto-discovers all Agent/Skills, and is ready for queries.

## Core Operations

### 0. Show My Agent/Skill Status (Auto-Discovery)

**When**: User asks "看看我的 Agent 状态", "what agents do I have?", "show my skills", "我有哪些 Agent/Skill"

```bash
# Get auto-discovered packages + their status
curl -s http://localhost:3000/api/discovered
# Get all agents with scores
curl -s http://localhost:3000/api/agents
```

**Response format — present to user as:**

```
🛡️ KYA 自动发现 — 您的 Agent/Skill 状态

自动扫描发现 4 个 Agent/Skill 包:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 OKX OnchainOS Skills  v1.0.0  by OKX
   🟢 运行中 | 技能 5 | 风险评分 11/100 SAFE
   ├─ okx-wallet-portfolio (余额查询)
   ├─ okx-dex-market (行情数据)
   ├─ okx-dex-swap (DEX交易)
   ├─ okx-dex-token (代币搜索)
   └─ okx-onchain-gateway (交易广播)
   ⚠️ 发现: 46个凭证暴露 (3个API Key, 2个Secret)

📦 Binance Skills Hub  v1.2.0  by Binance
   🟢 运行中 | 技能 5 | 风险评分 6/100 SAFE
   ├─ binance-market (市场数据)
   ├─ binance-trade (交易执行)
   ├─ binance-portfolio (资产查询)
   ├─ binance-earn (理财产品)
   └─ binance-payment (支付)
   ✅ 未发现安全风险

📦 Gate Skills  v2026.3.16  by Gate.io
   🟢 运行中 | 技能 30 | 风险评分 0/100 TRUSTED
   ✅ 未发现安全风险

📦 Bitget Wallet Skill  v0.3.1  by Bitget
   🟢 运行中 | 技能 4 | 风险评分 0/100 TRUSTED
   ✅ 未发现安全风险

━━━━━━━━━━━━━━━━━━━━━━━━
📊 总计: 4 包 | 44 技能 | 平均风险: 4.3/100

💡 输入 "详细看 OKX" 查看具体风险分析
   输入 "重新扫描" 刷新状态
```

If user asks to re-scan:
```bash
curl -s -X POST http://localhost:3000/api/discover
```

### 1. Check Address AML Risk

**When**: User asks "check if this address is safe", "is 0x... risky?", "AML check"

```bash
curl -s http://localhost:3000/api/aml/check/{address}?chain={chain}
```

Supported chains: `ETH`, `BSC`, `SOL`, `TRX`, `MATIC`, `ARB`

**Response format — present to user as:**

```
🔒 AML 地址风险检测

地址: 0x1234...abcd
链:   Ethereum
━━━━━━━━━━━━━━━━━━━━━━━━

🔴 风险评分: 85/100 — HIGH RISK

标签: 🏴 Mixer | 💀 Stolen Funds | 🕵️ Suspicious
实体类型: DeFi Protocol
威胁情报匹配: 3
关联风险实体: 12

⚠️ 警告: 该地址存在高风险标记，建议避免交互。
```

If `is_flagged` is false:

```
🔒 AML 地址风险检测

地址: 0x1234...abcd
链:   Ethereum
━━━━━━━━━━━━━━━━━━━━━━━━

🟢 风险评分: 5/100 — CLEAN

标签: ✅ 无风险标记
实体类型: Normal User

✅ 该地址风险评分较低，可以正常交互。
```

### 2. Pre-Transfer Risk Check

**When**: User asks "check before I send", "is it safe to transfer to..."

```bash
curl -s -X POST http://localhost:3000/api/aml/pre-transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "0x...", "to": "0x...", "chain": "ETH", "amount": "1000000"}'
```

**Response format:**

```
🔐 转账前安全检查

发送方: 0xABC...1234
接收方: 0xDEF...5678
链: Ethereum | 金额: 1.0 ETH
━━━━━━━━━━━━━━━━━━━━━━━━

发送方风险: 🟢 5/100 — Clean
接收方风险: 🔴 78/100 — HIGH

⚠️ 接收方地址存在风险标记：Mixer, Phishing
建议: 取消转账，确认接收方地址来源。
```

### 3. View All Monitored Agents

**When**: User asks "show agents", "what agents are monitored?", "agent list"

```bash
curl -s http://localhost:3000/api/agents
```

**Response format:**

```
🛡️ KYA 监控面板 — Agent 列表

Agent                     状态    技能  风险   API调用
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔷 OKX OnchainOS Skills  🟢 LIVE   5   11    142
🔶 Binance Skills Hub    🟢 LIVE   5    6    198
⚙️ Gate Skills           🟢 LIVE  30    0    165
🔵 Bitget Wallet Skill   🟢 LIVE   4    0    120

📊 共监控 4 个 Agent | 🚨 告警 23 条 | 🔒 AML检查 8 次
```

### 4. Get Agent Risk Score

**When**: User asks "risk score for...", "how risky is this agent?", "agent security status"

```bash
curl -s http://localhost:3000/api/agents/{agentId}/score
```

**Response format:**

```
📊 Agent 风险评分 — OKX OnchainOS Skills

综合评分: 15/100 — 🟢 TRUSTED
━━━━━━━━━━━━━━━━━━━━━━━━

🔑 凭证安全   ████████░░ 82/100
🧠 行为合规   █████████░ 90/100
💰 交易安全   ██████░░░░ 65/100
⛓️ 链上风险   █████████░ 88/100

最近变化: ↗ 上升 3 分 (凭证扫描发现 API Key 暴露)
建议: 检查 credential-detector 扫描结果中的 46 项发现
```

### 5. View Security Alerts

**When**: User asks "any alerts?", "security warnings", "show risk alerts"

```bash
curl -s http://localhost:3000/api/alerts/{agentId}
```

**Response format:**

```
🚨 安全告警 — OKX OnchainOS Skills

严重: 2 | 高危: 5 | 中危: 8 | 低危: 3
━━━━━━━━━━━━━━━━━━━━━━━━

🔴 CRITICAL | 大额交易告警
   金额 $50,000 超过阈值 $10,000
   时间: 14:23:05

🔴 CRITICAL | AML 地址风险
   Mixer, Stolen Funds — 风险分: 85/100
   时间: 14:22:58

🟠 HIGH | 无限授权风险
   Token Approval UNLIMITED 已触发
   时间: 14:21:33

🟡 MEDIUM | 高滑点异常
   滑点 15% 超过基线 (平均 1.2%)
   时间: 14:20:12

(显示最近 4 条，共 18 条告警)
```

### 6. Scan Skill Package

**When**: User asks "scan this package", "check for vulnerabilities", "audit this skill"

```bash
curl -s -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/agent-skills"}'
```

**Response format:**

```
🔍 Skill 包安全扫描报告

目标: /path/to/onchainos-skills
Agent: onchainos-skills v1.0.0 by OKX
━━━━━━━━━━━━━━━━━━━━━━━━

📊 风险评分: 11/100 — 🟢 SAFE

📦 Skills 扫描 (5个):
  ✅ okx-wallet-portfolio
  ✅ okx-dex-market
  ⚠️ okx-dex-swap (2 个凭证暴露)
  ✅ okx-dex-token
  ✅ okx-onchain-gateway

🔑 凭证发现: 46 项
  ├─ API Key 暴露: 3 处 (SKILL.md 示例代码中)
  ├─ Hardcoded Secret: 2 处
  └─ 环境变量引用: 41 处 (正常)

🛡️ Prompt Injection 风险: 0

💡 建议:
  1. 检查 okx-dex-swap 中的凭证暴露
  2. 确认 API Key 是否为测试用途
```

### 7. Dashboard Overview Stats

**When**: User asks "overview", "status", "dashboard"

```bash
curl -s http://localhost:3000/api/stats
```

**Response format:**

```
🛡️ KYA 监控概览

━━━━ 实时状态 ━━━━
📡 监控 Agent: 4
📊 API 调用总计: 1,403
🚨 活跃告警: 166
🔒 AML 检查: 6

━━━━ AML 引擎 ━━━━
模式: Simulation
缓存地址: 12
标记地址: 3

━━━━ 最近动态 ━━━━
• 14:23 🔴 大额交易告警 (OKX OnchainOS)
• 14:22 🟠 无限授权风险 (Binance Skills Hub)
• 14:20 🟡 高滑点异常 (Gate Skills)
```

### 8. View On-Chain Events

**When**: User asks "chain activity", "on-chain events", "transaction monitor"

```bash
curl -s http://localhost:3000/api/chain-events
```

**Response format:**

```
⛓️ 链上活动监控

时间     链       事件      金额          可疑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14:23   ETH   Transfer   2.5 ETH        ❌
14:22   BSC   Approval   UNLIMITED      ⚠️
14:21   SOL   Swap       $1,200 USDC    ❌
14:20   ETH   Transfer   15.0 ETH       ⚠️

⚠️ 警告事件已触发告警规则
```

## Operation Flow

### Step 1: Ensure Server Running

Before any API call, verify server is running:
```bash
curl -s http://localhost:3000/api/stats > /dev/null 2>&1 || (cd kya-agent && npm start &)
```

### Step 2: Identify User Intent

| User Says | Action |
|---|---|
| "看看我的Agent" / "my skills status" | → Call `/api/discovered` + `/api/agents` |
| "重新扫描" / "rescan" | → Call `POST /api/discover` |
| "检查地址风险" / "AML check" | → Call `/api/aml/check/:address` |
| "转账前检查" / "safe to send?" | → Call `/api/aml/pre-transfer` |
| "查看 Agent" / "agent list" | → Call `/api/agents` |
| "风险评分" / "risk score" | → Call `/api/agents/:id/score` |
| "安全告警" / "alerts" | → Call `/api/alerts` |
| "扫描 skill" / "audit package" | → Call `POST /api/scan` |
| "状态概览" / "dashboard" | → Call `/api/stats` |
| "链上活动" / "chain events" | → Call `/api/chain-events` |

### Step 3: Format & Return

- Always use the response formats above
- Use emoji for visual hierarchy
- Truncate addresses to `0x1234...abcd` format
- Show risk colors: 🟢 (0-20), 🟡 (21-40), 🟠 (41-60), 🔴 (61-100)
- For amounts, convert minimal units to human-readable (e.g., wei → ETH)
- Present in user's language (Chinese or English based on conversation)

### Step 4: Suggest Next Steps

Present conversationally after each result:

| Just completed | Suggest |
|---|---|
| AML address check (clean) | "需要检查其他地址吗？或者进行转账前安全检查？" |
| AML address check (flagged) | "建议不要与该地址交互。需要查看更多详情或检查关联地址吗？" |
| Agent list | "需要查看哪个 Agent 的详细风险评分？" |
| Risk score | "需要查看具体的安全告警记录吗？" |
| Scan result | "需要查看具体告警详情，或扫描其他 skill 包吗？" |
| Alert review | "需要查看 Agent 风险评分趋势，或检查特定地址的 AML 状态吗？" |

**Never** expose API paths, curl commands, or technical details to the user. Present results naturally in conversation.

## Edge Cases

- **Server not running**: Start it with `cd kya-agent && npm start &`, wait 2 seconds, then retry
- **No MISTTRACK_API_KEY**: AML engine runs in simulation mode (generates realistic mock data)
- **Address not found**: Return "该地址暂无风险记录" with green status
- **Empty alerts**: Return "🎉 暂无安全告警，所有 Agent 运行正常"
- **Scan path not found**: Ask user to provide correct path to skill directory

## Global Notes

- All API responses are JSON — parse and format before presenting
- Risk score is 0-100: 0 = safest, 100 = most dangerous
- Always present results in rich formatted text, never raw JSON
- Support bilingual output (Chinese/English) based on user's conversation language
- Keep responses concise — show key info first, offer "查看更多" for details
