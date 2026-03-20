/**
 * KYA Agent — Risk Rule Engine v2.0
 * Real-time rule-based risk assessment with cooldown & tuned thresholds
 */

const CHAIN_NAMES = {
  '1': 'Ethereum', '56': 'BSC', '196': 'XLayer', '501': 'Solana',
  '8453': 'Base', '42161': 'Arbitrum', '137': 'Polygon', '10': 'Optimism',
};

// Blacklisted addresses (known scams, mixers, etc)
const BLACKLIST = new Set([
  '0x0000000000000000000000000000000000000000', // null address
  // Add known malicious contracts/wallets here
]);

class RuleEngine {
  constructor() {
    this.rules = this._initRules();
    this.callHistory = {};       // per-agent sliding window
    this.windowSize = 300000;    // 5 minute sliding window
    this.firstCallTimestamps = {};
    this.cooldowns = {};         // { ruleId:agentId -> lastFiredTs }
    this.cooldownDuration = 300000; // 5 min cooldown per rule per agent
  }

  /**
   * Check if a rule is in cooldown for a given agent
   */
  _inCooldown(ruleId, agentId) {
    const key = `${ruleId}:${agentId}`;
    const lastFired = this.cooldowns[key];
    if (!lastFired) return false;
    return (Date.now() - lastFired) < this.cooldownDuration;
  }

  /**
   * Mark a rule as fired (start cooldown)
   */
  _markFired(ruleId, agentId) {
    this.cooldowns[`${ruleId}:${agentId}`] = Date.now();
  }

  /**
   * Get per-agent call history
   */
  _getAgentHistory(agentId) {
    if (!this.callHistory[agentId]) this.callHistory[agentId] = [];
    return this.callHistory[agentId];
  }

  /**
   * Initialize all risk rules (v2 — tuned thresholds)
   */
  _initRules() {
    return [
      // === FREQUENCY RULES ===
      {
        id: 'FREQ_001',
        name: 'API 调用频率异常',
        category: 'FREQUENCY',
        severity: 'MEDIUM',
        check: (call, ctx) => {
          // v2: per-agent history, threshold raised to 50/min
          const recentCalls = ctx.agentHistory.filter(
            c => Date.now() - new Date(c.timestamp).getTime() < 60000
          );
          if (recentCalls.length > 50) {
            return { triggered: true, detail: `过去1分钟内 ${recentCalls.length} 次API调用（阈值: 50）` };
          }
          return { triggered: false };
        },
      },
      {
        id: 'FREQ_002',
        name: '高频报价请求',
        category: 'FREQUENCY',
        severity: 'LOW',
        check: (call, ctx) => {
          if (call.classification?.type !== 'QUOTE') return { triggered: false };
          const recentQuotes = ctx.agentHistory.filter(
            c => c.classification?.type === 'QUOTE' && Date.now() - new Date(c.timestamp).getTime() < 60000
          );
          // v2: raised to 20 — DEX agents quote frequently by design
          if (recentQuotes.length > 20) {
            return { triggered: true, detail: `过去1分钟内 ${recentQuotes.length} 次报价请求（阈值: 20）` };
          }
          return { triggered: false };
        },
      },

      // === AMOUNT RULES ===
      {
        id: 'AMT_001',
        name: '大额交易预警',
        category: 'AMOUNT',
        severity: 'HIGH',
        check: (call) => {
          if (!call.amount) return { triggered: false };
          if (typeof call.amount === 'string' && !/^\d+$/.test(call.amount)) return { triggered: false };
          try {
            const amount = BigInt(call.amount);
            // > 10B minimal units (e.g. ~10 ETH in wei)
            if (amount > BigInt('10000000000000000000')) {
              return {
                triggered: true,
                detail: `大额交易: ${call.amount} minimal units (chain: ${CHAIN_NAMES[call.chain_index] || call.chain_index})`,
              };
            }
          } catch { /* non-numeric */ }
          return { triggered: false };
        },
      },
      {
        id: 'AMT_002',
        name: '无限额度 Token Approval',
        category: 'AMOUNT',
        severity: 'CRITICAL',
        check: (call) => {
          if (call.classification?.type !== 'TOKEN_APPROVAL') return { triggered: false };
          const maxUint = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
          if (call.amount === maxUint || call.amount === 'UNLIMITED' ||
              (call.amount && call.amount.length > 50)) {
            return {
              triggered: true,
              detail: `无限额度 Token Approval — 合约可以转走所有代币`,
            };
          }
          return { triggered: false };
        },
      },

      // === BEHAVIOR RULES ===
      {
        id: 'BHV_001',
        name: '首次调用高危端点',
        category: 'BEHAVIOR',
        // v2: downgraded to LOW — notification only, not a real alert
        severity: 'LOW',
        check: (call, ctx) => {
          const highRiskTypes = ['SWAP_EXECUTE', 'SWAP_INSTRUCTION', 'TOKEN_APPROVAL', 'TX_BROADCAST'];
          if (!highRiskTypes.includes(call.classification?.type)) return { triggered: false };

          const key = `${call.agent_id}:${call.classification.type}`;
          if (!ctx.firstCallTimestamps[key]) {
            ctx.firstCallTimestamps[key] = call.timestamp;
            return {
              triggered: true,
              detail: `Agent 首次调用 ${call.classification.type} 端点 — 新行为模式`,
            };
          }
          return { triggered: false };
        },
      },
      {
        id: 'BHV_002',
        name: '异常交易对',
        category: 'BEHAVIOR',
        severity: 'MEDIUM',
        check: (call, ctx) => {
          if (!call.from_token || !call.to_token) return { triggered: false };

          const pair = `${call.from_token}:${call.to_token}`;
          const pairKey = `_knownPairs_${call.agent_id}`;
          if (!ctx[pairKey]) ctx[pairKey] = new Set();

          // v2: learning phase extended to 20 pairs (from 5)
          if (ctx[pairKey].size > 20 && !ctx[pairKey].has(pair)) {
            return {
              triggered: true,
              detail: `Agent正在交易新的Token对: ${pair}（已知 ${ctx[pairKey].size} 对）`,
            };
          }
          ctx[pairKey].add(pair);
          return { triggered: false };
        },
      },
      {
        id: 'BHV_003',
        name: '高滑点设置',
        category: 'BEHAVIOR',
        severity: 'HIGH',
        check: (call) => {
          if (!call.slippage) return { triggered: false };
          const slippage = parseFloat(call.slippage);
          if (slippage > 5) {
            return {
              triggered: true,
              detail: `滑点设置 ${slippage}%（超过5%阈值）— 可能遭受三明治攻击`,
            };
          }
          return { triggered: false };
        },
      },

      // === BLACKLIST RULES ===
      {
        id: 'BLK_001',
        name: '黑名单地址交互',
        category: 'BLACKLIST',
        severity: 'CRITICAL',
        check: (call) => {
          const addresses = [call.from_token, call.to_token, call.wallet_address].filter(Boolean);
          for (const addr of addresses) {
            if (BLACKLIST.has(addr.toLowerCase())) {
              return {
                triggered: true,
                detail: `与黑名单地址交互: ${addr}`,
              };
            }
          }
          return { triggered: false };
        },
      },

      // === APPROVAL RULES ===
      {
        id: 'APR_001',
        name: '频繁 Token Approval',
        category: 'APPROVAL',
        severity: 'MEDIUM',
        check: (call, ctx) => {
          if (call.classification?.type !== 'TOKEN_APPROVAL') return { triggered: false };
          const recentApprovals = ctx.agentHistory.filter(
            c => c.classification?.type === 'TOKEN_APPROVAL' &&
              Date.now() - new Date(c.timestamp).getTime() < 3600000 // 1 hour
          );
          if (recentApprovals.length > 5) {
            return {
              triggered: true,
              detail: `过去1小时内 ${recentApprovals.length} 次 Token Approval（阈值: 5）`,
            };
          }
          return { triggered: false };
        },
      },

      // v2: TIME_001 removed — Agents run globally, no timezone concept

      // === CHAIN RULES ===
      {
        id: 'CHN_001',
        name: '跨链频繁切换',
        category: 'CHAIN',
        // v2: threshold raised from 4 to 6, multi-chain agents cross 5 chains normally
        severity: 'MEDIUM',
        check: (call, ctx) => {
          if (!call.chain_index) return { triggered: false };
          const recentChains = new Set(
            ctx.agentHistory
              .filter(c => c.chain_index && Date.now() - new Date(c.timestamp).getTime() < 300000)
              .map(c => c.chain_index)
          );
          recentChains.add(call.chain_index);
          if (recentChains.size > 6) {
            return {
              triggered: true,
              detail: `过去5分钟内操作了 ${recentChains.size} 条链 — 可能的资金混淆行为`,
            };
          }
          return { triggered: false };
        },
      },
    ];
  }

  /**
   * Evaluate all rules against a single API call
   * v2: per-agent history + cooldown mechanism
   * @returns {object} { alerts: [], total_risk_score: number }
   */
  evaluate(apiCall) {
    const agentId = apiCall.agent_id || 'unknown';

    // Add to per-agent history
    const history = this._getAgentHistory(agentId);
    history.push(apiCall);

    // Clean old entries (keep last 5 minutes)
    const cutoff = Date.now() - this.windowSize;
    this.callHistory[agentId] = history.filter(
      c => new Date(c.timestamp).getTime() > cutoff
    );

    const ctx = {
      agentHistory: this.callHistory[agentId],
      callHistory: this.callHistory[agentId], // backward compat
      firstCallTimestamps: this.firstCallTimestamps,
    };

    const alerts = [];
    let totalScore = 0;

    for (const rule of this.rules) {
      try {
        // v2: skip if in cooldown
        if (this._inCooldown(rule.id, agentId)) continue;

        const result = rule.check(apiCall, ctx);
        if (result.triggered) {
          const severityScore = { LOW: 5, MEDIUM: 15, HIGH: 35, CRITICAL: 70 };
          const score = severityScore[rule.severity] || 15;
          totalScore += score;

          // v2: start cooldown
          this._markFired(rule.id, agentId);

          alerts.push({
            rule_id: rule.id,
            rule_name: rule.name,
            severity: rule.severity,
            category: rule.category,
            description: result.detail,
            timestamp: apiCall.timestamp,
            agent_id: agentId,
          });
        }
      } catch (err) {
        console.error(`Rule ${rule.id} error:`, err.message);
      }
    }

    // Normalize score to 0-100
    totalScore = Math.min(100, totalScore);

    return {
      alerts,
      total_risk_score: totalScore,
      risk_level: totalScore >= 70 ? 'CRITICAL' : totalScore >= 40 ? 'HIGH' : totalScore >= 15 ? 'MEDIUM' : 'LOW',
    };
  }

  /**
   * Get summary statistics
   */
  getStats() {
    return {
      total_rules: this.rules.length,
      rules_by_category: this.rules.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {}),
      active_cooldowns: Object.keys(this.cooldowns).length,
      first_call_endpoints: Object.keys(this.firstCallTimestamps).length,
    };
  }
}

module.exports = { RuleEngine };
