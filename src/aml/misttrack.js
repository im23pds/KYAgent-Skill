/**
 * KYA Agent — MistTrack AML (Anti-Money Laundering) Module
 * Integrates with MistTrack API for address risk scoring and entity labeling
 * https://github.com/slowmist/misttrack-skills
 */

const MISTTRACK_BASE = 'https://openapi.misttrack.io';

// Simulated AML database for demo (no real API key needed)
const SIMULATED_LABELS = {
  '0x0000000000000000000000000000000000000000': { labels: ['Null Address'], risk: 'LOW', score: 10 },
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045': { labels: ['Vitalik Buterin', 'Known Entity'], risk: 'LOW', score: 5 },
  '0x28C6c06298d514Db089934071355E5743bf21d60': { labels: ['Binance Hot Wallet'], risk: 'LOW', score: 10 },
  '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549': { labels: ['Binance Hot Wallet 2'], risk: 'LOW', score: 10 },
  '0x56Eddb7aa87536c09CCc2793473599fD21A8b17F': { labels: ['OKX Hot Wallet'], risk: 'LOW', score: 10 },
  '0x98EC059Dc3aDFBdd63429454aEB0C990FBA4A128': { labels: ['Gate.io Hot Wallet'], risk: 'LOW', score: 10 },
  '0xAgentWallet': { labels: ['Unknown Agent Wallet', 'Unverified'], risk: 'MEDIUM', score: 35 },
  '0xDEXRouter': { labels: ['DEX Router Contract'], risk: 'LOW', score: 15 },
  '0xOKXDEXRouter': { labels: ['OKX DEX Router'], risk: 'LOW', score: 10 },
  '0xSpenderContract': { labels: ['Unknown Spender Contract'], risk: 'MEDIUM', score: 40 },
};

// High-risk patterns
const HIGH_RISK_PATTERNS = [
  { pattern: /tornado/i, label: 'Tornado Cash (Mixer)', risk: 'CRITICAL', score: 95 },
  { pattern: /mixer/i, label: 'Token Mixer', risk: 'CRITICAL', score: 90 },
  { pattern: /sanctioned/i, label: 'OFAC Sanctioned', risk: 'CRITICAL', score: 100 },
  { pattern: /phishing/i, label: 'Phishing Address', risk: 'HIGH', score: 85 },
  { pattern: /scam/i, label: 'Known Scam', risk: 'HIGH', score: 80 },
  { pattern: /hack/i, label: 'Hacker Address', risk: 'HIGH', score: 85 },
  { pattern: /exploit/i, label: 'Exploit Related', risk: 'HIGH', score: 80 },
  { pattern: /drainer/i, label: 'Wallet Drainer', risk: 'CRITICAL', score: 95 },
  { pattern: /gambling/i, label: 'Gambling Platform', risk: 'MEDIUM', score: 50 },
  { pattern: /darknet/i, label: 'Darknet Market', risk: 'CRITICAL', score: 95 },
];

// Supported chains mapping
const SUPPORTED_CHAINS = {
  '1': 'ETH', '56': 'BSC', '196': 'XLayer', '501': 'SOL',
  '8453': 'BASE', '42161': 'ARB', '137': 'MATIC',
  'ETH': 'ETH', 'BSC': 'BSC', 'SOL': 'SOL', 'TRON': 'TRX',
};

class MistTrackAML {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.MISTTRACK_API_KEY || null;
    this.useSimulation = !this.apiKey;
    this.cache = new Map(); // address -> { result, timestamp }
    this.cacheTTL = 300000; // 5 minutes
    this.checkCount = 0;
    this.flagCount = 0;
  }

  /**
   * Check address risk via MistTrack API or simulation
   * @returns {{ risk_level, risk_score, labels, entity_type, details }}
   */
  async checkAddress(address, chain = 'ETH') {
    if (!address) return this._emptyResult();

    const normalizedAddr = address.toLowerCase();
    const cacheKey = `${normalizedAddr}:${chain}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    this.checkCount++;
    let result;

    if (this.useSimulation) {
      result = this._simulateCheck(normalizedAddr, chain);
    } else {
      result = await this._apiCheck(normalizedAddr, chain);
    }

    // Cache result
    this.cache.set(cacheKey, { result, timestamp: Date.now() });

    if (result.risk_score >= 50) this.flagCount++;

    return result;
  }

  /**
   * Simulated AML check (demo mode)
   */
  _simulateCheck(address, chain) {
    // Check known addresses
    for (const [addr, info] of Object.entries(SIMULATED_LABELS)) {
      if (addr.toLowerCase() === address) {
        return {
          address,
          chain: SUPPORTED_CHAINS[chain] || chain,
          risk_level: info.risk,
          risk_score: info.score,
          labels: info.labels,
          entity_type: this._classifyEntity(info.labels),
          is_flagged: info.score >= 50,
          details: {
            source: 'MistTrack (Simulated)',
            checked_at: new Date().toISOString(),
            threat_intel_matches: 0,
            connected_risk_entities: 0,
          },
        };
      }
    }

    // Check high-risk patterns (for dynamically generated addresses)
    for (const hrp of HIGH_RISK_PATTERNS) {
      if (hrp.pattern.test(address)) {
        return {
          address,
          chain: SUPPORTED_CHAINS[chain] || chain,
          risk_level: hrp.risk,
          risk_score: hrp.score,
          labels: [hrp.label],
          entity_type: 'MALICIOUS',
          is_flagged: true,
          details: {
            source: 'MistTrack (Simulated)',
            checked_at: new Date().toISOString(),
            threat_intel_matches: 1,
            connected_risk_entities: Math.floor(Math.random() * 10),
          },
        };
      }
    }

    // Default: generate a risk score based on address hash
    const hashScore = this._addressHashScore(address);
    const riskLevel = hashScore >= 70 ? 'HIGH' : hashScore >= 40 ? 'MEDIUM' : 'LOW';

    return {
      address,
      chain: SUPPORTED_CHAINS[chain] || chain,
      risk_level: riskLevel,
      risk_score: hashScore,
      labels: hashScore >= 50 ? ['Suspicious Activity Detected'] : ['No Known Labels'],
      entity_type: hashScore >= 70 ? 'SUSPICIOUS' : 'UNKNOWN',
      is_flagged: hashScore >= 50,
      details: {
        source: 'MistTrack (Simulated)',
        checked_at: new Date().toISOString(),
        threat_intel_matches: hashScore >= 50 ? Math.floor(Math.random() * 5) : 0,
        connected_risk_entities: hashScore >= 70 ? Math.floor(Math.random() * 20) : 0,
      },
    };
  }

  /**
   * Real API check (when API key is available)
   */
  async _apiCheck(address, chain) {
    try {
      const coin = SUPPORTED_CHAINS[chain] || 'ETH';

      // v2/risk_score
      const riskRes = await fetch(`${MISTTRACK_BASE}/v2/risk_score?coin=${coin}&address=${address}`, {
        headers: { 'API-KEY': this.apiKey },
      });
      const riskData = await riskRes.json();

      // v1/address_labels
      const labelRes = await fetch(`${MISTTRACK_BASE}/v1/address_labels?coin=${coin}&address=${address}`, {
        headers: { 'API-KEY': this.apiKey },
      });
      const labelData = await labelRes.json();

      const score = riskData?.data?.risk_score ?? 50;
      const level = riskData?.data?.risk_level || (score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW');
      const labels = labelData?.data?.labels || [];

      return {
        address,
        chain: coin,
        risk_level: level,
        risk_score: score,
        labels: labels.length > 0 ? labels : ['No Known Labels'],
        entity_type: this._classifyEntity(labels),
        is_flagged: score >= 50,
        details: {
          source: 'MistTrack API',
          checked_at: new Date().toISOString(),
          risk_detail: riskData?.data?.detail || null,
          threat_intel_matches: riskData?.data?.detail_list?.length || 0,
          connected_risk_entities: riskData?.data?.risk_entities_count || 0,
        },
      };
    } catch (err) {
      console.error(`MistTrack API error: ${err.message}`);
      return this._simulateCheck(address, chain);
    }
  }

  /**
   * Pre-transfer security check
   * Checks both sender and receiver before allowing a transfer
   */
  async preTransferCheck(fromAddress, toAddress, chain = 'ETH', amount = '0') {
    const [fromResult, toResult] = await Promise.all([
      this.checkAddress(fromAddress, chain),
      this.checkAddress(toAddress, chain),
    ]);

    const worstScore = Math.max(fromResult.risk_score, toResult.risk_score);
    let recommendation = 'ALLOW';
    let reason = '';

    if (worstScore >= 80) {
      recommendation = 'BLOCK';
      reason = `High AML risk detected: ${toResult.labels.join(', ')}`;
    } else if (worstScore >= 50) {
      recommendation = 'REVIEW';
      reason = `Moderate risk — manual review recommended: ${toResult.labels.join(', ')}`;
    } else {
      reason = 'Address passed AML checks';
    }

    return {
      recommendation,
      reason,
      from: fromResult,
      to: toResult,
      worst_risk_score: worstScore,
      checked_at: new Date().toISOString(),
    };
  }

  /**
   * Classify entity type from labels
   */
  _classifyEntity(labels) {
    const joined = labels.join(' ').toLowerCase();
    if (/exchange|binance|okx|gate|bitget|coinbase|kraken/i.test(joined)) return 'EXCHANGE';
    if (/mixer|tornado/i.test(joined)) return 'MIXER';
    if (/dex|uniswap|sushi|router/i.test(joined)) return 'DEX';
    if (/scam|phishing|hack|exploit|drainer/i.test(joined)) return 'MALICIOUS';
    if (/sanctioned|ofac/i.test(joined)) return 'SANCTIONED';
    if (/gambling/i.test(joined)) return 'GAMBLING';
    if (/bridge/i.test(joined)) return 'BRIDGE';
    if (/mining|pool/i.test(joined)) return 'MINING_POOL';
    if (/wallet/i.test(joined)) return 'WALLET';
    return 'UNKNOWN';
  }

  /**
   * Generate a deterministic risk score from address (for simulation consistency)
   */
  _addressHashScore(address) {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = ((hash << 5) - hash) + address.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 60); // 0-59 range for most random addresses
  }

  _emptyResult() {
    return {
      address: null, chain: null, risk_level: 'UNKNOWN',
      risk_score: 0, labels: [], entity_type: 'UNKNOWN',
      is_flagged: false, details: {},
    };
  }

  getStats() {
    return {
      total_checks: this.checkCount,
      flagged_addresses: this.flagCount,
      cache_size: this.cache.size,
      mode: this.useSimulation ? 'SIMULATION' : 'API',
    };
  }
}

module.exports = { MistTrackAML };
