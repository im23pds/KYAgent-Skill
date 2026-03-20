/**
 * KYA Agent — Chain Monitor
 * On-chain activity monitoring for Agent-associated wallets
 */
const { ethers } = require('ethers');
const EventEmitter = require('events');

// ERC20 Transfer and Approval event signatures
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const APPROVAL_TOPIC = ethers.id('Approval(address,address,uint256)');

// Well-known token addresses
const KNOWN_TOKENS = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
};

// uint256 max for detecting unlimited approvals
const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

class ChainMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rpcUrl = options.rpcUrl || 'https://eth.llamarpc.com'; // Free public RPC
    this.watchedAddresses = new Set();
    this.agentId = options.agentId || 'unknown';
    this.provider = null;
    this.pollInterval = options.pollInterval || 30000; // 30 seconds
    this._pollTimer = null;
    this._lastBlock = 0;
  }

  /**
   * Add a wallet address to monitor
   */
  watchAddress(address) {
    if (address && address.startsWith('0x')) {
      this.watchedAddresses.add(address.toLowerCase());
      console.log(`👁️  Watching address: ${address}`);
    }
  }

  /**
   * Start monitoring
   */
  async start() {
    try {
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      this._lastBlock = await this.provider.getBlockNumber();
      console.log(`⛓️  Chain Monitor started (block: ${this._lastBlock})`);
      console.log(`   Watching ${this.watchedAddresses.size} address(es)`);

      this._poll();
    } catch (err) {
      console.error(`⛓️  Chain Monitor start failed: ${err.message}`);
      console.log(`⛓️  Running in simulation mode`);
      this._simulatePoll();
    }
  }

  /**
   * Poll for new events
   */
  async _poll() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      if (currentBlock <= this._lastBlock) {
        this._pollTimer = setTimeout(() => this._poll(), this.pollInterval);
        return;
      }

      const fromBlock = this._lastBlock + 1;
      const toBlock = Math.min(currentBlock, fromBlock + 100); // Max 100 blocks per query

      for (const address of this.watchedAddresses) {
        // Query Transfer events
        try {
          const transferLogs = await this.provider.getLogs({
            fromBlock, toBlock,
            topics: [TRANSFER_TOPIC],
            address: null, // All tokens
          });

          for (const log of transferLogs) {
            const from = '0x' + log.topics[1]?.slice(26);
            const to = '0x' + log.topics[2]?.slice(26);

            if (from.toLowerCase() === address || to.toLowerCase() === address) {
              const tokenInfo = KNOWN_TOKENS[log.address.toLowerCase()] || { symbol: 'UNKNOWN', decimals: 18 };
              const amount = BigInt(log.data);
              const formattedAmount = ethers.formatUnits(amount, tokenInfo.decimals);

              const event = {
                agent_id: this.agentId,
                chain: 'Ethereum',
                tx_hash: log.transactionHash,
                event_type: 'TRANSFER',
                from_address: from,
                to_address: to,
                token_address: log.address,
                amount: formattedAmount,
                amount_usd: 0, // Would need price oracle
                is_suspicious: from.toLowerCase() === address ? 1 : 0, // Outgoing = flag
                details: JSON.stringify({
                  token_symbol: tokenInfo.symbol,
                  direction: from.toLowerCase() === address ? 'OUT' : 'IN',
                  block_number: log.blockNumber,
                }),
              };

              this.emit('chain-event', event);
            }
          }
        } catch (err) {
          // RPC errors are common, just skip
        }
      }

      this._lastBlock = toBlock;
    } catch (err) {
      console.error(`⛓️  Poll error: ${err.message}`);
    }

    this._pollTimer = setTimeout(() => this._poll(), this.pollInterval);
  }

  /**
   * Simulation mode for demo
   */
  _simulatePoll() {
    const simulatedEvents = [
      {
        agent_id: this.agentId,
        chain: 'Ethereum',
        tx_hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        event_type: 'TRANSFER',
        from_address: '0xAgentWallet',
        to_address: '0xDEXRouter',
        token_address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        amount: '1500.00',
        amount_usd: 1500,
        is_suspicious: 0,
        details: JSON.stringify({ token_symbol: 'USDT', direction: 'OUT', block_number: 19500000 }),
      },
      {
        agent_id: this.agentId,
        chain: 'Ethereum',
        tx_hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        event_type: 'APPROVAL',
        from_address: '0xAgentWallet',
        to_address: '0xSpenderContract',
        token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amount: 'UNLIMITED',
        amount_usd: 0,
        is_suspicious: 1,
        details: JSON.stringify({ token_symbol: 'USDC', approval_type: 'UNLIMITED', block_number: 19500010 }),
      },
      {
        agent_id: this.agentId,
        chain: 'XLayer',
        tx_hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        event_type: 'SWAP',
        from_address: '0xAgentWallet',
        to_address: '0xOKXDEXRouter',
        token_address: '0x74b7f16337b8972027f6196a17a631ac6de26d22',
        amount: '500.00',
        amount_usd: 500,
        is_suspicious: 0,
        details: JSON.stringify({ token_symbol: 'USDC', direction: 'SWAP_OUT', block_number: 1200000 }),
      },
    ];

    let idx = 0;
    const emitSimulated = () => {
      const event = { ...simulatedEvents[idx % simulatedEvents.length] };
      event.tx_hash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      this.emit('chain-event', event);
      idx++;
      this._pollTimer = setTimeout(emitSimulated, 10000 + Math.random() * 20000);
    };

    // Emit initial events
    setTimeout(() => {
      this.emit('chain-event', simulatedEvents[0]);
      this.emit('chain-event', simulatedEvents[1]);
    }, 2000);

    this._pollTimer = setTimeout(emitSimulated, 15000);
  }

  stop() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }
}

module.exports = { ChainMonitor };
