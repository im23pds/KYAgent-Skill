/**
 * KYA Agent — Anomaly Detector v2.0
 * Statistical anomaly detection with tuned thresholds to reduce false positives
 */

class AnomalyDetector {
  constructor() {
    // Sliding window metrics
    this.metrics = {};
    this.windowSize = 3600000;   // 1 hour
    this.baselineWindow = 86400000; // 24 hours
    this.minDataPoints = 20;     // v2: raised from 5 — skip cold-start period
    this.zThreshold = 2.5;       // v2: raised from 2.0 — reduce edge-case false positives
    this.zThresholdHigh = 3.5;   // for HIGH severity
  }

  /**
   * Record a metric data point
   */
  record(agentId, metricName, value, timestamp = Date.now()) {
    const key = `${agentId}:${metricName}`;
    if (!this.metrics[key]) {
      this.metrics[key] = [];
    }
    this.metrics[key].push({ value, timestamp });

    // Clean old data (keep 24h)
    const cutoff = timestamp - this.baselineWindow;
    this.metrics[key] = this.metrics[key].filter(m => m.timestamp > cutoff);
  }

  /**
   * Calculate Z-Score for a new value against the baseline
   * v2: requires minDataPoints=20 before flagging anomalies
   */
  zScore(agentId, metricName, currentValue) {
    const key = `${agentId}:${metricName}`;
    const data = this.metrics[key] || [];
    if (data.length < this.minDataPoints) return { score: 0, sufficient_data: false };

    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return { score: currentValue === mean ? 0 : 5, sufficient_data: true, mean, stdDev: 0 };

    const z = (currentValue - mean) / stdDev;
    return {
      score: Math.abs(z),
      direction: z > 0 ? 'above' : 'below',
      sufficient_data: true,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      data_points: values.length,
    };
  }

  /**
   * Analyze an API call for anomalies
   * v2: higher thresholds, removed chain-diversity (overlap with rule-engine CHN_001)
   */
  analyzeCall(apiCall) {
    const agentId = apiCall.agent_id;
    const anomalies = [];
    const now = Date.now();

    // 1. API call rate anomaly
    this.record(agentId, 'call_rate', 1, now);
    const recentCalls = (this.metrics[`${agentId}:call_rate`] || [])
      .filter(m => m.timestamp > now - 60000).length;
    this.record(agentId, 'calls_per_minute', recentCalls, now);
    const rateZ = this.zScore(agentId, 'calls_per_minute', recentCalls);
    if (rateZ.sufficient_data && rateZ.score > this.zThresholdHigh) {
      anomalies.push({
        type: 'CALL_RATE_ANOMALY',
        severity: rateZ.score > 4 ? 'HIGH' : 'MEDIUM',
        detail: `API调用频率异常: ${recentCalls}/min (均值: ${rateZ.mean}/min, Z-Score: ${rateZ.score.toFixed(2)})`,
        z_score: rateZ.score,
      });
    }

    // 2. Response time anomaly
    if (apiCall.duration_ms) {
      this.record(agentId, 'response_time', apiCall.duration_ms, now);
      const rtZ = this.zScore(agentId, 'response_time', apiCall.duration_ms);
      if (rtZ.sufficient_data && rtZ.score > this.zThresholdHigh) {
        anomalies.push({
          type: 'RESPONSE_TIME_ANOMALY',
          severity: 'LOW',
          detail: `响应时间异常: ${apiCall.duration_ms}ms (均值: ${rtZ.mean}ms, Z-Score: ${rtZ.score.toFixed(2)})`,
          z_score: rtZ.score,
        });
      }
    }

    // 3. Transaction amount anomaly
    if (apiCall.amount && apiCall.amount !== 'UNLIMITED') {
      try {
        const amount = Number(BigInt(apiCall.amount));
        this.record(agentId, 'tx_amount', amount, now);
        const amtZ = this.zScore(agentId, 'tx_amount', amount);
        // v2: raised threshold to 2.5
        if (amtZ.sufficient_data && amtZ.score > this.zThreshold) {
          anomalies.push({
            type: 'AMOUNT_ANOMALY',
            severity: amtZ.score > this.zThresholdHigh ? 'HIGH' : 'MEDIUM',
            detail: `交易金额异常: ${apiCall.amount} (均值: ${amtZ.mean}, Z-Score: ${amtZ.score.toFixed(2)})`,
            z_score: amtZ.score,
          });
        }
      } catch { /* skip non-numeric amounts */ }
    }

    // 4. Endpoint diversity anomaly
    if (apiCall.classification?.type) {
      const endpointKey = `${agentId}:endpoint_types`;
      if (!this.metrics[endpointKey]) this.metrics[endpointKey] = [];
      this.metrics[endpointKey].push({ value: apiCall.classification.type, timestamp: now });

      const cutoff = now - this.windowSize;
      this.metrics[endpointKey] = this.metrics[endpointKey].filter(m => m.timestamp > cutoff);

      const recentTypes = new Set(this.metrics[endpointKey].map(m => m.value));
      this.record(agentId, 'endpoint_diversity', recentTypes.size, now);
      const divZ = this.zScore(agentId, 'endpoint_diversity', recentTypes.size);
      if (divZ.sufficient_data && divZ.score > this.zThreshold && divZ.direction === 'above') {
        anomalies.push({
          type: 'ENDPOINT_DIVERSITY_ANOMALY',
          severity: 'MEDIUM',
          detail: `端点多样性异常增加: ${recentTypes.size} 个不同端点 (均值: ${divZ.mean})`,
          z_score: divZ.score,
        });
      }
    }

    // v2: Removed chain diversity check (duplicated by rule-engine CHN_001)

    return anomalies;
  }

  /**
   * Get baseline summary for an agent
   */
  getBaseline(agentId) {
    const result = {};
    const prefix = `${agentId}:`;

    for (const [key, dataPoints] of Object.entries(this.metrics)) {
      if (!key.startsWith(prefix)) continue;
      const metricName = key.replace(prefix, '');

      // Skip non-numeric tracking arrays
      if (typeof dataPoints[0]?.value === 'string') continue;

      const values = dataPoints.map(d => d.value);
      if (values.length === 0) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

      result[metricName] = {
        data_points: values.length,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
        min: Math.min(...values),
        max: Math.max(...values),
        latest: values[values.length - 1],
        sufficient_for_anomaly: values.length >= this.minDataPoints,
      };
    }

    return result;
  }
}

module.exports = { AnomalyDetector };
