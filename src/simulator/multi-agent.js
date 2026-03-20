/**
 * KYA Agent — Multi-Agent Simulator
 * Generates realistic API events for multiple agents: OKX, Bitget, Binance, Gate
 */
const EventEmitter = require('events');

// ═══ Agent Definitions ═══
const AGENTS = {
  'onchainos-skills': {
    name: 'onchainos-skills',
    display_name: 'OKX OnchainOS Skills',
    author: 'OKX',
    version: '1.0.0',
    description: 'OKX DEX Aggregator — swap, quote, token search, market data',
    homepage: 'https://web3.okx.com',
    logo: 'img/okx.png',
    skills: ['okx-dex-market', 'okx-dex-swap', 'okx-dex-token', 'okx-onchain-gateway', 'okx-wallet-portfolio'],
    skills_count: 5,
    chains: ['1', '56', '196', '501', '8453'],
    risk_features: ['hardcoded_credentials', 'prompt_injection', 'unlimited_approval'],
  },
  'bitget-wallet-skill': {
    name: 'bitget-wallet-skill',
    display_name: 'Bitget Wallet Skill',
    author: 'Bitget',
    version: '0.3.1',
    description: 'Token swap, cross-chain bridge, gasless transactions via Order Mode API',
    homepage: 'https://web3.bitget.com',
    logo: 'img/bitget.png',
    skills: ['bitget-swap', 'bitget-bridge', 'bitget-gasless', 'bitget-portfolio'],
    skills_count: 4,
    chains: ['1', '56', '137', '42161', '8453', '10', '501'],
    risk_features: ['cross_chain_bridge', 'gasless_relay'],
  },
  'binance-skills-hub': {
    name: 'binance-skills-hub',
    display_name: 'Binance Skills Hub',
    author: 'Binance',
    version: '1.2.0',
    description: 'Open skills marketplace — market data, crypto payments, portfolio management',
    homepage: 'https://www.binance.com',
    logo: 'img/binance.png',
    skills: ['binance-market-data', 'binance-pay', 'binance-portfolio', 'binance-earn', 'binance-convert'],
    skills_count: 5,
    chains: ['1', '56', '501'],
    risk_features: ['api_key_exposure', 'high_frequency_trading'],
  },
  'gate-skills': {
    name: 'gate-skills',
    display_name: 'Gate Skills',
    author: 'Gate.io',
    version: '2026.3.16',
    description: '30+ skills — exchange, DEX, market analysis, futures, staking, news',
    homepage: 'https://www.gate.io',
    logo: 'img/gate.png',
    skills: [
      'gate-exchange-spot', 'gate-exchange-futures', 'gate-exchange-trading-copilot',
      'gate-exchange-alpha', 'gate-exchange-flashswap', 'gate-exchange-transfer',
      'gate-dex-market', 'gate-dex-trade', 'gate-dex-wallet',
      'gate-info-addresstracker', 'gate-info-coinanalysis', 'gate-info-riskcheck',
      'gate-news-briefing', 'gate-news-listing', 'gate-exchange-staking',
    ],
    skills_count: 30,
    chains: ['1', '56', '42161', '137', '8453'],
    risk_features: ['futures_leverage', 'subaccount_management', 'high_volume'],
  },
};

// ═══ Scenario templates per agent ═══
function createScenarios(agentId) {
  const agent = AGENTS[agentId];
  if (!agent) return [];

  const baseScenarios = {
    'onchainos-skills': [
      () => makeCall(agentId, 'GET', '/api/v6/dex/aggregator/quote', 'QUOTE', 'LOW', '196', { from_token: '0x74b7', to_token: '0xeeee', amount: '100000000' }),
      () => makeCall(agentId, 'GET', '/api/v6/wallet/asset/all-token-balances-by-address', 'BALANCE_QUERY', 'LOW', '1', { wallet_address: '0xAgentWallet' }),
      () => makeCall(agentId, 'GET', '/api/v6/dex/market/token/search', 'TOKEN_SEARCH', 'LOW', '501', {}),
      () => makeCall(agentId, 'GET', '/api/v6/dex/aggregator/swap', 'SWAP_EXECUTE', 'HIGH', '1', { from_token: '0xdAC1', to_token: '0xeeee', amount: '50000000000', slippage: '10', wallet_address: '0xAgentWallet' }),
      () => makeCall(agentId, 'GET', '/api/v6/dex/aggregator/approve-transaction', 'TOKEN_APPROVAL', 'HIGH', '1', { to_token: '0xdAC1', amount: 'UNLIMITED' }),
      () => makeCall(agentId, 'GET', '/api/v6/dex/aggregator/supported/chain', 'CHAIN_QUERY', 'LOW', null, {}),
    ],
    'bitget-wallet-skill': [
      () => makeCall(agentId, 'POST', '/api/v1/order/swap', 'SWAP_EXECUTE', 'HIGH', '1', { from_token: '0xA0b86991', to_token: '0xeeee', amount: '1000000000', wallet_address: '0xBitgetUser' }),
      () => makeCall(agentId, 'GET', '/api/v1/quote/bridge', 'QUOTE', 'LOW', '1', { from_token: '0xA0b86991', to_token: '0xeeee', amount: '500000000' }),
      () => makeCall(agentId, 'POST', '/api/v1/order/bridge', 'BRIDGE_EXECUTE', 'HIGH', '1', { from_token: '0xA0b86991', to_token: '0xeeee', amount: '2000000000', wallet_address: '0xBitgetUser' }),
      () => makeCall(agentId, 'GET', '/api/v1/portfolio/balances', 'BALANCE_QUERY', 'LOW', '56', { wallet_address: '0xBitgetUser' }),
      () => makeCall(agentId, 'POST', '/api/v1/order/gasless', 'GASLESS_TX', 'MEDIUM', '137', { from_token: '0xA0b86991', to_token: '0x2791Bca1', amount: '100000000', wallet_address: '0xBitgetUser' }),
      () => makeCall(agentId, 'GET', '/api/v1/chains/supported', 'CHAIN_QUERY', 'LOW', null, {}),
    ],
    'binance-skills-hub': [
      () => makeCall(agentId, 'GET', '/api/v3/ticker/24hr', 'MARKET_DATA', 'LOW', null, {}),
      () => makeCall(agentId, 'GET', '/api/v3/klines', 'MARKET_DATA', 'LOW', null, {}),
      () => makeCall(agentId, 'POST', '/api/v1/pay/transfer', 'PAYMENT', 'HIGH', '56', { amount: '100000000', wallet_address: '0xBinanceUser' }),
      () => makeCall(agentId, 'GET', '/api/v1/portfolio/snapshot', 'BALANCE_QUERY', 'LOW', '1', { wallet_address: '0xBinanceUser' }),
      () => makeCall(agentId, 'POST', '/api/v1/convert/trade', 'SWAP_EXECUTE', 'HIGH', '56', { from_token: 'BNB', to_token: 'USDT', amount: '5000000000', wallet_address: '0xBinanceUser' }),
      () => makeCall(agentId, 'GET', '/api/v1/earn/products', 'EARN_QUERY', 'LOW', null, {}),
    ],
    'gate-skills': [
      () => makeCall(agentId, 'GET', '/api/v4/spot/tickers', 'MARKET_DATA', 'LOW', null, {}),
      () => makeCall(agentId, 'POST', '/api/v4/spot/orders', 'SPOT_ORDER', 'HIGH', null, { from_token: 'BTC', to_token: 'USDT', amount: '10000000000' }),
      () => makeCall(agentId, 'POST', '/api/v4/futures/orders', 'FUTURES_ORDER', 'HIGH', null, { from_token: 'ETH', amount: '5000000000', slippage: '2' }),
      () => makeCall(agentId, 'GET', '/api/v4/wallet/balances', 'BALANCE_QUERY', 'LOW', '1', { wallet_address: '0xGateUser' }),
      () => makeCall(agentId, 'POST', '/api/v4/flashswap/orders', 'SWAP_EXECUTE', 'HIGH', '56', { from_token: 'USDT', to_token: 'ETH', amount: '20000000000', wallet_address: '0xGateUser' }),
      () => makeCall(agentId, 'GET', '/api/v4/earn/staking/list', 'EARN_QUERY', 'LOW', null, {}),
      () => makeCall(agentId, 'GET', '/gate-info-riskcheck', 'RISK_CHECK', 'LOW', '1', {}),
      () => makeCall(agentId, 'POST', '/api/v4/dex/trade', 'SWAP_EXECUTE', 'HIGH', '1', { from_token: '0xdAC1', to_token: '0xeeee', amount: '8000000000', wallet_address: '0xGateUser' }),
    ],
  };

  return baseScenarios[agentId] || [];
}

function makeCall(agentId, method, path, type, risk, chainIndex, params) {
  return {
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    method,
    url: `https://api.${AGENTS[agentId]?.homepage?.replace('https://', '') || 'example.com'}${path}`,
    path,
    query_params: JSON.stringify(params),
    request_headers: JSON.stringify({ 'authorization': 'Bearer ***...[REDACTED]' }),
    request_body: method === 'POST' ? JSON.stringify(params) : null,
    response_status: 200,
    response_body: JSON.stringify({ code: '0', msg: 'success' }),
    duration_ms: 100 + Math.floor(Math.random() * 400),
    chain_index: chainIndex,
    from_token: params.from_token || null,
    to_token: params.to_token || null,
    amount: params.amount || null,
    wallet_address: params.wallet_address || null,
    slippage: params.slippage || null,
    classification: { type, risk },
    risk_flags: '[]',
    risk_score: 0,
  };
}

// ═══ Multi-Agent Simulator ═══
class MultiAgentSimulator extends EventEmitter {
  constructor() {
    super();
    this.agents = { ...AGENTS };
    this.timers = {};
    this._callCounts = {};
    this.startTimes = {};
  }

  start() {
    console.log(`🔀 Multi-Agent Simulator started for ${Object.keys(this.agents).length} agents`);

    for (const agentId of Object.keys(this.agents)) {
      this._callCounts[agentId] = 0;
      this.startTimes[agentId] = Date.now();
      const scenarios = createScenarios(agentId);
      if (scenarios.length === 0) continue;

      // Initial burst: 2 events per agent
      for (let i = 0; i < 2; i++) {
        const event = scenarios[i % scenarios.length]();
        this.emit('api-call', event);
        this._callCounts[agentId]++;
      }

      // Ongoing: emit events at varying intervals per agent
      this._scheduleNext(agentId, scenarios);
    }
  }

  _scheduleNext(agentId, scenarios) {
    // Different agents have different activity levels
    const agentDelays = {
      'onchainos-skills': [3000, 8000],
      'bitget-wallet-skill': [4000, 12000],
      'binance-skills-hub': [2000, 6000],
      'gate-skills': [2000, 5000],
    };

    const [min, max] = agentDelays[agentId] || [3000, 8000];
    const delay = min + Math.random() * (max - min);

    this.timers[agentId] = setTimeout(() => {
      const scenario = scenarios[this._callCounts[agentId] % scenarios.length];
      const event = scenario();
      this.emit('api-call', event);
      this._callCounts[agentId]++;
      this._scheduleNext(agentId, scenarios);
    }, delay);
  }

  getAgentList() {
    return Object.entries(this.agents).map(([id, agent]) => ({
      id,
      name: agent.display_name,
      author: agent.author,
      version: agent.version,
      description: agent.description,
      homepage: agent.homepage,
      logo: agent.logo,
      skills_count: agent.skills_count,
      skills: agent.skills,
      chains: agent.chains,
      status: 'RUNNING',
      uptime_ms: this.startTimes[id] ? Date.now() - this.startTimes[id] : 0,
      api_calls: this._callCounts[id] || 0,
    }));
  }

  stop() {
    for (const timer of Object.values(this.timers)) {
      clearTimeout(timer);
    }
    this.timers = {};
  }
}

module.exports = { MultiAgentSimulator, AGENTS };
