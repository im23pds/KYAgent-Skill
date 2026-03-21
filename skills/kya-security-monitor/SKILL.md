---
name: kyad-security-monitor
description: "This skill should be used when the user asks to 'monitor AI agent security', 'check agent risk score', 'scan an agent skill package for vulnerabilities', 'run AML check on an address', 'detect credential exposure', 'analyze agent API call patterns', 'check if an address is flagged', 'monitor on-chain activity', 'assess agent behavior risk', or mentions security monitoring, AML anti-fraud, risk assessment, credential scanning, prompt injection detection, or agent behavior analysis. KYA (Know Your Agent) is a real-time multi-agent security monitoring system with AML integration. Do NOT use for general programming questions or non-security topics."
license: Apache-2.0
metadata:
  author: 23pds
  version: "2.1.0"
  homepage: "https://github.com/23pds/KYAD-Skill"
---

# KYAD — Know Your Agent Doing

Real-time multi-agent AI security monitoring with AML anti-fraud detection.
多 Agent 实时安全监控与反洗钱反欺诈检测系统。

## Auto-Discovery (Key Feature) | 自动发现机制（核心特性）

KYA **automatically discovers** all installed Agent/Skill packages on the user's system at startup.
KYA 在启动时会**自动发现**用户系统上所有已安装的 Agent/Skill 插件包。

**What it scans (扫描范围):**
- Sibling directories to kya-agent (same parent folder) / KYA 同级目录（如与其同处一个工作区）
- Home directory plugin locations (`~/.claude/plugins/`, `~/.cursor/plugins/`) / 用户主目录的插件位置
- Paths specified via `ONCHAINOS_PATH` or `KYA_SCAN_PATHS` env vars / 环境变量指定的路径
- Current working directory children / 当前工作目录的子目录

**Detection markers** (any one triggers recognition | 以下任意一项即可触发识别):
- Has `skills/*/SKILL.md` files / 包含技能定义文件
- Has `.claude-plugin/` or `.cursor-plugin/` directory / 包含大模型 IDE 插件目录
- Has `AGENTS.md` file / 包含 Agent 说明文件
- `package.json` contains keywords like `skills`, `claude-code`, `agent` / 包管理器包含特定关键词

Users do NOT need to configure anything — KYA finds all installed skills automatically.
用户**无需配置**任何路径，系统自动寻找并建立监控。

## Prerequisites | 前置要求

Start KYA server before using commands:
在使用监控指令前，需启动 KYA 服务：

```bash
cd kya-agent && npm install && npm start
```

Server starts, auto-discovers all Agent/Skills, and is ready for queries.
服务启动后，自动发现机制将扫描所有的插件并准备好接受查询。

## Core Operations | 核心操作

### 0. Show My Agent/Skill Status (Auto-Discovery) | 0. 查看我的 Agent/Skill 状态

**When**: User asks "看看我的 Agent 状态", "what agents do I have?", "show my skills", "我有哪些 Agent/Skill"
**使用时机**: 用户询问“看看我的 Agent 状态”、“what agents do I have?”等。

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
如果用户要求重新扫描：
```bash
curl -s -X POST http://localhost:3000/api/discover
```

### 1. Check Address AML Risk | 1. 检查地址 AML 风险

**When**: User asks "check if this address is safe", "is 0x... risky?", "AML check"
**使用时机**: 用户询问“检查这个地址是否安全”、“0x...有风险吗”、“AML检查”等。

```bash
curl -s http://localhost:3000/api/aml/check/{address}?chain={chain}
```

Supported chains (支持的链): `ETH`, `BSC`, `SOL`, `TRX`, `MATIC`, `ARB`

**Response format — present to user as:**
**响应格式 — 展示给用户如下：**

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
如果 `is_flagged` 为 false：

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

### 2. Pre-Transfer Risk Check | 2. 转账前风险检查

**When**: User asks "check before I send", "is it safe to transfer to..."
**使用时机**: 用户询问“转账前检查一下”、“转给...安全吗”等。

```bash
curl -s -X POST http://localhost:3000/api/aml/pre-transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "0x...", "to": "0x...", "chain": "ETH", "amount": "1000000"}'
```

**Response format:**
**响应格式：**

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

### 3. View All Monitored Agents | 3. 查看所有被监控的 Agent

**When**: User asks "show agents", "what agents are monitored?", "agent list"
**使用时机**: 用户询问“显示 Agent 列表”、“监控了哪些 Agent”等。

```bash
curl -s http://localhost:3000/api/agents
```

**Response format:**
**响应格式：**

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

### 4. Get Agent Risk Score | 4. 获取 Agent 风险评分

**When**: User asks "risk score for...", "how risky is this agent?", "agent security status"
**使用时机**: 用户询问“某个 Agent 的风险评分”、“这个 Agent 安全吗”等。

```bash
curl -s http://localhost:3000/api/agents/{agentId}/score
```

**Response format:**
**响应格式：**

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

### 5. View Security Alerts | 5. 查看安全告警

**When**: User asks "any alerts?", "security warnings", "show risk alerts"
**使用时机**: 用户询问“有什么告警吗”、“安全警告”、“显示风险告警”等。

```bash
curl -s http://localhost:3000/api/alerts/{agentId}
```

**Response format:**
**响应格式：**

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

### 6. Scan Skill Package | 6. 扫描技能包

**When**: User asks "scan this package", "check for vulnerabilities", "audit this skill"
**使用时机**: 用户询问“扫描这个包”、“检查漏洞”、“审计这个技能”等。

```bash
curl -s -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/agent-skills"}'
```

**Response format:**
**响应格式：**

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

### 7. Dashboard Overview Stats | 7. 控制台概览统计

**When**: User asks "overview", "status", "dashboard"
**使用时机**: 用户询问“概览”、“状态”、“控制台数据”等。

```bash
curl -s http://localhost:3000/api/stats
```

**Response format:**
**响应格式：**

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

### 8. View On-Chain Events | 8. 查看链上事件

**When**: User asks "chain activity", "on-chain events", "transaction monitor"
**使用时机**: 用户询问“链上活动”、“链上事件”、“交易监控”等。

```bash
curl -s http://localhost:3000/api/chain-events
```

**Response format:**
**响应格式：**

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

## Operation Flow | 操作流

### Step 1: Ensure Server Running | 步骤 1: 确保服务运行中

Before any API call, verify server is running:
在任何 API 调用之前，验证服务是否正在运行：
```bash
curl -s http://localhost:3000/api/stats > /dev/null 2>&1 || (cd kya-agent && npm start &)
```

### Step 2: Identify User Intent | 步骤 2: 识别用户意图

| User Says (用户输入) | Action (对应操作) |
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

### Step 3: Format & Return | 步骤 3: 格式化与返回

- Always use the response formats above (始终使用上述定义的响应格式)
- Use emoji for visual hierarchy (使用 Emoji 来区分视觉层级)
- Truncate addresses to `0x1234...abcd` format (将长地址截断为短格式)
- Show risk colors: 🟢 (0-20), 🟡 (21-40), 🟠 (41-60), 🔴 (61-100) (显示风险颜色)
- For amounts, convert minimal units to human-readable (e.g., wei → ETH) (格式化金额单位)
- Present in user's language (Chinese or English based on conversation) (根据用户的语言偏好输出结果)

### Step 4: Suggest Next Steps | 步骤 4: 建议后续步骤

Present conversationally after each result:
在每次输出结果后，用自然语言提出下一步建议：

| Just completed (刚完成的操作) | Suggest (建议话术) |
|---|---|
| AML address check (clean) | "需要检查其他地址吗？或者进行转账前安全检查？" |
| AML address check (flagged) | "建议不要与该地址交互。需要查看更多详情或检查关联地址吗？" |
| Agent list | "需要查看哪个 Agent 的详细风险评分？" |
| Risk score | "需要查看具体的安全告警记录吗？" |
| Scan result | "需要查看具体告警详情，或扫描其他 skill 包吗？" |
| Alert review | "需要查看 Agent 风险评分趋势，或检查特定地址的 AML 状态吗？" |

**Never** expose API paths, curl commands, or technical details to the user. Present results naturally in conversation.
**绝对不要**向用户暴露 API 路径、curl 命令等技术细节。用自然的对话方式呈现结果。

## Edge Cases | 边缘情况处理

- **Server not running**: Start it with `cd kya-agent && npm start &`, wait 2 seconds, then retry (服务未运行：自动启动并等待重试)
- **No MISTTRACK_API_KEY**: AML engine runs in simulation mode (generates realistic mock data) (缺少慢雾 API 密钥：自动进入模拟数据模式)
- **Address not found**: Return "该地址暂无风险记录" with green status (地址未查到风险：返回绿色的安全状态)
- **Empty alerts**: Return "🎉 暂无安全告警，所有 Agent 运行正常" (没有告警时：返回正常的恭喜话语)
- **Scan path not found**: Ask user to provide correct path to skill directory (扫描路径不存在：询问用户正确的路径)

## Global Notes | 全局注意事项

- All API responses are JSON — parse and format before presenting (所有接口响应都是 JSON，展示前必须格式化)
- Risk score is 0-100: 0 = safest, 100 = most dangerous (风险分 0-100，0最安全，100最危险)
- Always present results in rich formatted text, never raw JSON (永远以富文本格式输出，绝不直接抛出 JSON)
- Support bilingual output (Chinese/English) based on user's conversation language (支持双语输出，视用户当前对话语言而定)
- Keep responses concise — show key info first, offer "查看更多" for details (保持响应简洁，先说重点，提供“查看更多”选项)
