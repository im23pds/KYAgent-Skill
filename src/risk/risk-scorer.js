/**
 * KYA Agent — Risk Scorer v2.0
 * Multi-dimensional risk scoring with time decay to prevent score collapse
 */

class RiskScorer {
  constructor() {
    this.weights = {
      credential: 0.30,  // 凭证安全
      behavior: 0.25,    // 行为合规
      transaction: 0.25, // 交易安全
      chain: 0.20,       // 链上风险
    };

    // Accumulated deductions per agent
    this.deductions = {};

    // v2: track last decay time per agent
    this.lastDecayTime = {};
    this.decayInterval = 1800000; // 30 minutes
    this.decayRate = 0.10;        // 10% decay per interval
    this.maxSingleDeduction = 15; // v2: cap per-alert deduction
  }

  /**
   * v2: Apply time-based decay to deductions
   */
  _applyDecay(agentId) {
    const now = Date.now();
    const lastDecay = this.lastDecayTime[agentId] || now;
    const elapsed = now - lastDecay;

    if (elapsed < this.decayInterval) return;

    const d = this.deductions[agentId];
    if (!d) return;

    // How many decay intervals have passed
    const intervals = Math.floor(elapsed / this.decayInterval);
    const factor = Math.pow(1 - this.decayRate, intervals);

    d.credential = Math.round(d.credential * factor);
    d.behavior = Math.round(d.behavior * factor);
    d.transaction = Math.round(d.transaction * factor);
    d.chain = Math.round(d.chain * factor);

    this.lastDecayTime[agentId] = now;
  }

  /**
   * Apply deductions based on fired alerts
   * v2: LOW alerts don't deduct, single deduction capped at 15
   */
  applyAlert(agentId, alert) {
    if (!this.deductions[agentId]) {
      this.deductions[agentId] = {
        credential: 0, behavior: 0, transaction: 0, chain: 0,
        alert_count: 0, critical_count: 0,
      };
      this.lastDecayTime[agentId] = Date.now();
    }

    const d = this.deductions[agentId];
    d.alert_count++;

    // v2: LOW alerts are informational — no score deduction
    if (alert.severity === 'LOW') return;

    const severityMap = { MEDIUM: 5, HIGH: 10, CRITICAL: 15 };
    // v2: capped at maxSingleDeduction (15)
    const deduction = Math.min(this.maxSingleDeduction, severityMap[alert.severity] || 5);

    // Map category to dimension
    const catMap = {
      FREQUENCY: 'behavior',
      AMOUNT: 'transaction',
      BEHAVIOR: 'behavior',
      BLACKLIST: 'chain',
      APPROVAL: 'transaction',
      CHAIN: 'chain',
      AML: 'chain',
    };

    const dim = catMap[alert.category] || 'behavior';
    d[dim] = Math.min(80, d[dim] + deduction); // v2: cap at 80 per dimension (never fully zero)

    if (alert.severity === 'CRITICAL') d.critical_count++;
  }

  /**
   * Apply deductions from static scan results
   */
  applyScanResults(agentId, scanResult) {
    if (!this.deductions[agentId]) {
      this.deductions[agentId] = {
        credential: 0, behavior: 0, transaction: 0, chain: 0,
        alert_count: 0, critical_count: 0,
      };
      this.lastDecayTime[agentId] = Date.now();
    }

    const d = this.deductions[agentId];

    if (scanResult?.risk_assessment) {
      const ra = scanResult.risk_assessment;
      d.credential = Math.max(d.credential, 100 - (ra.scores?.credential || 100));
      d.behavior = Math.max(d.behavior, 100 - (ra.scores?.behavior || 100));
      d.transaction = Math.max(d.transaction, 100 - (ra.scores?.transaction || 100));
    }
  }

  /**
   * Calculate the current risk score for an agent
   * v2: applies time decay before calculation
   */
  calculateScore(agentId) {
    // v2: apply time decay
    this._applyDecay(agentId);

    const d = this.deductions[agentId] || {
      credential: 0, behavior: 0, transaction: 0, chain: 0,
      alert_count: 0, critical_count: 0,
    };

    // v3: INVERTED — higher score = more dangerous (0=safe, 100=dangerous)
    const scores = {
      credential: Math.min(80, d.credential),  // deductions ARE the danger score
      behavior: Math.min(80, d.behavior),
      transaction: Math.min(80, d.transaction),
      chain: Math.min(80, d.chain),
    };

    const overall = Math.round(
      scores.credential * this.weights.credential +
      scores.behavior * this.weights.behavior +
      scores.transaction * this.weights.transaction +
      scores.chain * this.weights.chain
    );

    // v3: inverted levels — higher = worse
    let level;
    if (overall <= 20) level = 'SAFE';
    else if (overall <= 40) level = 'WATCH';
    else if (overall <= 60) level = 'WARNING';
    else level = 'DANGEROUS';

    // Color: green=safe, red=dangerous
    const colors = { SAFE: '#22c55e', WATCH: '#eab308', WARNING: '#f97316', DANGEROUS: '#ef4444' };

    return {
      agent_id: agentId,
      overall_score: overall,
      level,
      color: colors[level],
      scores,
      total_alerts: d.alert_count,
      critical_alerts: d.critical_count,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { RiskScorer };
