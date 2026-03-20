/**
 * KYA Agent — API Proxy Interceptor
 * Transparent HTTP proxy that intercepts Agent ↔ OKX API communication
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');
const EventEmitter = require('events');

class ApiProxy extends EventEmitter {
  constructor(options = {}) {
    super();
    this.targetHost = options.targetHost || 'web3.okx.com';
    this.port = options.port || 3001;
    this.agentId = options.agentId || 'unknown';
    this.requestLog = [];
    this.server = null;
  }

  /**
   * Parse query parameters from URL to extract trading-relevant fields
   */
  extractTradingParams(urlStr) {
    try {
      const url = new URL(urlStr, `https://${this.targetHost}`);
      const params = Object.fromEntries(url.searchParams);
      return {
        chain_index: params.chainIndex || params.chain || null,
        from_token: params.fromTokenAddress || null,
        to_token: params.toTokenAddress || params.tokenContractAddress || null,
        amount: params.amount || params.approveAmount || null,
        wallet_address: params.userWalletAddress || null,
        slippage: params.slippagePercent || params.slippage || null,
        swap_mode: params.swapMode || null,
      };
    } catch {
      return {};
    }
  }

  /**
   * Classify the API endpoint
   */
  classifyEndpoint(path) {
    if (/\/swap-instruction/i.test(path)) return { type: 'SWAP_INSTRUCTION', risk: 'HIGH' };
    if (/\/swap$/i.test(path)) return { type: 'SWAP_EXECUTE', risk: 'HIGH' };
    if (/\/approve-transaction/i.test(path)) return { type: 'TOKEN_APPROVAL', risk: 'HIGH' };
    if (/\/quote/i.test(path)) return { type: 'QUOTE', risk: 'LOW' };
    if (/\/get-liquidity/i.test(path)) return { type: 'LIQUIDITY_QUERY', risk: 'LOW' };
    if (/\/supported\/chain/i.test(path)) return { type: 'CHAIN_QUERY', risk: 'LOW' };
    if (/\/token.*search/i.test(path)) return { type: 'TOKEN_SEARCH', risk: 'LOW' };
    if (/\/token.*detail/i.test(path)) return { type: 'TOKEN_DETAIL', risk: 'LOW' };
    if (/\/balance/i.test(path)) return { type: 'BALANCE_QUERY', risk: 'LOW' };
    if (/\/market/i.test(path)) return { type: 'MARKET_DATA', risk: 'LOW' };
    if (/\/broadcast/i.test(path)) return { type: 'TX_BROADCAST', risk: 'CRITICAL' };
    return { type: 'UNKNOWN', risk: 'MEDIUM' };
  }

  /**
   * Start the proxy server
   */
  start() {
    this.server = http.createServer((clientReq, clientRes) => {
      const startTime = Date.now();
      const requestPath = clientReq.url;
      const method = clientReq.method;

      // Collect request body
      let requestBody = '';
      clientReq.on('data', chunk => { requestBody += chunk; });

      clientReq.on('end', () => {
        const tradingParams = this.extractTradingParams(requestPath);
        const classification = this.classifyEndpoint(requestPath);

        // Build the log entry
        const logEntry = {
          agent_id: this.agentId,
          timestamp: new Date().toISOString(),
          method,
          url: `https://${this.targetHost}${requestPath}`,
          path: requestPath.split('?')[0],
          query_params: JSON.stringify(tradingParams),
          request_headers: JSON.stringify(this._sanitizeHeaders(clientReq.headers)),
          request_body: requestBody || null,
          response_status: null,
          response_body: null,
          duration_ms: null,
          ...tradingParams,
          classification,
          risk_flags: '[]',
          risk_score: 0,
        };

        // Emit pre-request event for real-time risk check
        this.emit('pre-request', logEntry);

        // Forward the request to the actual OKX API
        const proxyOptions = {
          hostname: this.targetHost,
          port: 443,
          path: requestPath,
          method: method,
          headers: {
            ...clientReq.headers,
            host: this.targetHost,
          },
        };

        const proxyReq = https.request(proxyOptions, (proxyRes) => {
          let responseBody = '';
          proxyRes.on('data', chunk => { responseBody += chunk; });

          proxyRes.on('end', () => {
            logEntry.response_status = proxyRes.statusCode;
            logEntry.duration_ms = Date.now() - startTime;

            // Truncate response body for storage (keep first 2KB)
            logEntry.response_body = responseBody.length > 2048
              ? responseBody.substring(0, 2048) + '...[truncated]'
              : responseBody;

            // Emit post-response event
            this.emit('api-call', logEntry);

            // Forward response to client
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
            clientRes.end(responseBody);
          });
        });

        proxyReq.on('error', (err) => {
          logEntry.response_status = 502;
          logEntry.response_body = JSON.stringify({ error: err.message });
          logEntry.duration_ms = Date.now() - startTime;
          this.emit('api-call', logEntry);
          this.emit('proxy-error', { error: err, logEntry });

          clientRes.writeHead(502, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
        });

        if (requestBody) proxyReq.write(requestBody);
        proxyReq.end();
      });
    });

    this.server.listen(this.port, () => {
      console.log(`🔀 KYA API Proxy listening on port ${this.port}`);
      console.log(`   Forwarding to: https://${this.targetHost}`);
      console.log(`   Agent ID: ${this.agentId}`);
    });

    return this;
  }

  /**
   * Remove sensitive headers before logging
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveKeys = ['ok-access-key', 'ok-access-sign', 'ok-access-passphrase', 'authorization'];
    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = sanitized[key].substring(0, 8) + '...[REDACTED]';
      }
    }
    return sanitized;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

/**
 * Simulated proxy for demo — generates realistic API call events without connecting to real API
 */
class SimulatedProxy extends EventEmitter {
  constructor(options = {}) {
    super();
    this.agentId = options.agentId || 'onchainos-skills';
    this.interval = null;
    this._callCount = 0;
  }

  start() {
    console.log(`🔀 KYA Simulated Proxy started for agent: ${this.agentId}`);
    this._generateEvents();
    return this;
  }

  _generateEvents() {
    const scenarios = [
      // Normal: quote request
      () => ({
        agent_id: this.agentId,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://web3.okx.com/api/v6/dex/aggregator/quote?chainIndex=196&fromTokenAddress=0x74b7f16337b8972027f6196a17a631ac6de26d22&toTokenAddress=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&amount=100000000&swapMode=exactIn',
        path: '/api/v6/dex/aggregator/quote',
        query_params: JSON.stringify({ chain_index: '196', from_token: '0x74b7f16337b8972027f6196a17a631ac6de26d22', to_token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '100000000', slippage: null }),
        request_headers: JSON.stringify({ 'ok-access-key': '03f0b376...[REDACTED]' }),
        request_body: null,
        response_status: 200,
        response_body: JSON.stringify({ code: '0', data: [{ toTokenAmount: '3200000000000000000', fromTokenAmount: '100000000', estimateGasFee: '0.001', priceImpactPercent: '0.05' }] }),
        duration_ms: 230,
        chain_index: '196', from_token: '0x74b7', to_token: '0xeeee', amount: '100000000', wallet_address: null, slippage: null,
        classification: { type: 'QUOTE', risk: 'LOW' },
        risk_flags: '[]', risk_score: 0,
      }),
      // Normal: balance check
      () => ({
        agent_id: this.agentId,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://web3.okx.com/api/v6/wallet/asset/all-token-balances-by-address?address=0xUserWallet&chains=1,196',
        path: '/api/v6/wallet/asset/all-token-balances-by-address',
        query_params: JSON.stringify({ wallet_address: '0xUserWallet', chain_index: '1,196' }),
        request_headers: JSON.stringify({ 'ok-access-key': '03f0b376...[REDACTED]' }),
        request_body: null,
        response_status: 200,
        response_body: JSON.stringify({ code: '0', data: [{ balance: '1500.50', symbol: 'USDC' }] }),
        duration_ms: 180,
        chain_index: '1', from_token: null, to_token: null, amount: null, wallet_address: '0xUserWallet', slippage: null,
        classification: { type: 'BALANCE_QUERY', risk: 'LOW' },
        risk_flags: '[]', risk_score: 0,
      }),
      // Normal: token search
      () => ({
        agent_id: this.agentId,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://web3.okx.com/api/v6/dex/market/token/search?search=BONK&chains=501',
        path: '/api/v6/dex/market/token/search',
        query_params: JSON.stringify({ chain_index: '501' }),
        request_headers: JSON.stringify({ 'ok-access-key': '03f0b376...[REDACTED]' }),
        request_body: null,
        response_status: 200,
        response_body: JSON.stringify({ code: '0', data: [{ tokenContractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' }] }),
        duration_ms: 150,
        chain_index: '501', from_token: null, to_token: null, amount: null, wallet_address: null, slippage: null,
        classification: { type: 'TOKEN_SEARCH', risk: 'LOW' },
        risk_flags: '[]', risk_score: 0,
      }),
      // ⚠️ Suspicious: swap with high amount
      () => ({
        agent_id: this.agentId,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://web3.okx.com/api/v6/dex/aggregator/swap?chainIndex=1&fromTokenAddress=0xdAC17F958D2ee523a2206206994597C13D831ec7&toTokenAddress=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&amount=50000000000&slippagePercent=10&userWalletAddress=0xAgentWallet',
        path: '/api/v6/dex/aggregator/swap',
        query_params: JSON.stringify({ chain_index: '1', from_token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', to_token: '0xeeee', amount: '50000000000', slippage: '10' }),
        request_headers: JSON.stringify({ 'ok-access-key': '03f0b376...[REDACTED]' }),
        request_body: null,
        response_status: 200,
        response_body: JSON.stringify({ code: '0', data: [{ tx: { from: '0xAgentWallet', to: '0xDEXRouter', data: '0x...', value: '0' } }] }),
        duration_ms: 450,
        chain_index: '1', from_token: '0xdAC1', to_token: '0xeeee', amount: '50000000000', wallet_address: '0xAgentWallet', slippage: '10',
        classification: { type: 'SWAP_EXECUTE', risk: 'HIGH' },
        risk_flags: '["HIGH_AMOUNT","HIGH_SLIPPAGE"]', risk_score: 75,
      }),
      // 🔴 Dangerous: unlimited approval
      () => ({
        agent_id: this.agentId,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://web3.okx.com/api/v6/dex/aggregator/approve-transaction?chainIndex=1&tokenContractAddress=0xdAC17F958D2ee523a2206206994597C13D831ec7&approveAmount=115792089237316195423570985008687907853269984665640564039457584007913129639935',
        path: '/api/v6/dex/aggregator/approve-transaction',
        query_params: JSON.stringify({ chain_index: '1', to_token: '0xdAC1', amount: 'UNLIMITED' }),
        request_headers: JSON.stringify({ 'ok-access-key': '03f0b376...[REDACTED]' }),
        request_body: null,
        response_status: 200,
        response_body: JSON.stringify({ code: '0', data: [{ data: '0x095ea7b3...', dexContractAddress: '0xRouter' }] }),
        duration_ms: 210,
        chain_index: '1', from_token: null, to_token: '0xdAC1', amount: 'UNLIMITED', wallet_address: null, slippage: null,
        classification: { type: 'TOKEN_APPROVAL', risk: 'HIGH' },
        risk_flags: '["UNLIMITED_APPROVAL"]', risk_score: 90,
      }),
      // Normal: supported chains
      () => ({
        agent_id: this.agentId,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://web3.okx.com/api/v6/dex/aggregator/supported/chain',
        path: '/api/v6/dex/aggregator/supported/chain',
        query_params: '{}',
        request_headers: JSON.stringify({ 'ok-access-key': '03f0b376...[REDACTED]' }),
        request_body: null,
        response_status: 200,
        response_body: JSON.stringify({ code: '0', data: [{ chainIndex: '1', chainName: 'Ethereum' }, { chainIndex: '196', chainName: 'XLayer' }] }),
        duration_ms: 120,
        chain_index: null, from_token: null, to_token: null, amount: null, wallet_address: null, slippage: null,
        classification: { type: 'CHAIN_QUERY', risk: 'LOW' },
        risk_flags: '[]', risk_score: 0,
      }),
    ];

    // Emit events at varying intervals
    const emitNext = () => {
      const scenario = scenarios[this._callCount % scenarios.length];
      const event = scenario();
      this.emit('api-call', event);
      this._callCount++;

      // Vary interval: 2-8 seconds
      const delay = 2000 + Math.random() * 6000;
      this.interval = setTimeout(emitNext, delay);
    };

    // Start with initial burst of 3 events
    for (let i = 0; i < 3; i++) {
      const scenario = scenarios[i % scenarios.length];
      this.emit('api-call', scenario());
      this._callCount++;
    }

    this.interval = setTimeout(emitNext, 3000);
  }

  stop() {
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
    }
  }
}

module.exports = { ApiProxy, SimulatedProxy };
