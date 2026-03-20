/**
 * KYA Agent — Main Server (Multi-Agent + AML)
 * Express server integrating all components with multi-agent support
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const http = require('http');

const { dbOps } = require('./src/db/database');
const { scanProject } = require('./src/scanner/skill-scanner');
const { discoverSkills } = require('./src/scanner/auto-discovery');
const { MultiAgentSimulator, AGENTS } = require('./src/simulator/multi-agent');
const { RuleEngine } = require('./src/risk/rule-engine');
const { AnomalyDetector } = require('./src/risk/anomaly-detector');
const { RiskScorer } = require('./src/risk/risk-scorer');
const { ChainMonitor } = require('./src/chain/chain-monitor');
const { MistTrackAML } = require('./src/aml/misttrack');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true,
}));

// === Initialize components ===
const ruleEngine = new RuleEngine();
const anomalyDetector = new AnomalyDetector();
const riskScorer = new RiskScorer();
const chainMonitor = new ChainMonitor({ agentId: 'onchainos-skills' });
const aml = new MistTrackAML();
const simulator = new MultiAgentSimulator();

// Create HTTP server for WebSocket support
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// WebSocket broadcast
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// === Auto-scan onchainos-skills on startup ===
const ONCHAINOS_PATH = process.env.ONCHAINOS_PATH ||
  path.join(__dirname, '..', 'onchainos-skills');

let scanResults = {};
let discoveredPackages = [];

// === Auto-discover and scan all Agent/Skills ===
function autoDiscover() {
  console.log('\n🔍 Auto-discovering installed Agent/Skills...');
  const extraPaths = [];
  if (process.env.ONCHAINOS_PATH) extraPaths.push(process.env.ONCHAINOS_PATH);
  if (process.env.KYA_SCAN_PATHS) extraPaths.push(...process.env.KYA_SCAN_PATHS.split(':'));

  discoveredPackages = discoverSkills({ extraPaths });

  console.log(`📦 Found ${discoveredPackages.length} Agent/Skill package(s):`);
  for (const pkg of discoveredPackages) {
    console.log(`   • ${pkg.name} (${pkg.skills_count} skills) — ${pkg.path}`);
  }

  // Scan each discovered package
  for (const pkg of discoveredPackages) {
    try {
      const result = scanAndRegister(pkg.path);
      if (result) {
        scanResults[result.agent.id || result.agent.name] = result;
      }
    } catch (err) {
      console.error(`   ⚠️  Failed to scan ${pkg.name}: ${err.message}`);
    }
  }

  return discoveredPackages;
}

function scanAndRegister(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.log(`⚠️  Path not found: ${targetPath}`);
    return null;
  }

  console.log(`\n🔍 Scanning: ${targetPath}`);
  const result = scanProject(targetPath);

  const agent = {
    id: result.agent.id || path.basename(targetPath),
    name: result.agent.name || path.basename(targetPath),
    version: result.agent.version || '1.0.0',
    author: result.agent.author || 'unknown',
    description: result.agent.description || '',
    homepage: result.agent.homepage || '',
    license: result.agent.license || 'unknown',
    skills_count: result.agent.skills_count,
    risk_score: result.risk_assessment.overall_score,
    risk_level: result.risk_assessment.level,
    scan_result: JSON.stringify(result),
  };

  dbOps.upsertAgent(agent);

  for (const skill of result.skills) {
    dbOps.insertSkill({
      agent_id: agent.id,
      name: skill.name,
      description: skill.description.substring(0, 500),
      api_endpoints: JSON.stringify(skill.api_endpoints),
      permissions: JSON.stringify(skill.permissions),
      credential_risks: JSON.stringify(
        result.credentials.findings.filter(f => f.file.includes(skill.name))
      ),
      prompt_injection_risk: result.prompt_injection_risks
        .filter(r => r.skill === skill.name).length,
    });
  }

  riskScorer.applyScanResults(agent.id, result);

  const score = riskScorer.calculateScore(agent.id);
  dbOps.insertScore({
    agent_id: agent.id,
    overall_score: score.overall_score,
    credential_score: score.scores.credential,
    behavior_score: score.scores.behavior,
    transaction_score: score.scores.transaction,
    chain_score: score.scores.chain,
    details: JSON.stringify(score),
  });

  dbOps.upsertAgent({ ...agent, risk_score: score.overall_score, risk_level: score.level });

  console.log(`✅ Scan complete: ${result.agent.name}`);
  console.log(`   Risk: ${score.level} (${score.overall_score}/100)`);
  console.log(`   Skills: ${result.skills.length}`);
  console.log(`   Credentials Found: ${result.credentials.summary.total_findings}`);

  return result;
}

// Legacy wrapper for backward compatibility
function performScan() {
  return scanAndRegister(ONCHAINOS_PATH);
}

// Register simulated agents in DB
function registerSimulatedAgents() {
  for (const [id, agent] of Object.entries(AGENTS)) {
    if (id === 'onchainos-skills') continue; // Already scanned
    dbOps.upsertAgent({
      id,
      name: agent.display_name,
      version: agent.version,
      author: agent.author,
      description: agent.description,
      homepage: agent.homepage,
      license: 'Apache-2.0',
      skills_count: agent.skills_count,
      risk_score: 85,
      risk_level: 'TRUSTED',
      scan_result: null,
    });

    const score = riskScorer.calculateScore(id);
    dbOps.insertScore({
      agent_id: id,
      overall_score: score.overall_score,
      credential_score: score.scores.credential,
      behavior_score: score.scores.behavior,
      transaction_score: score.scores.transaction,
      chain_score: score.scores.chain,
      details: JSON.stringify(score),
    });
  }
}

// === Event processing pipeline ===
simulator.on('api-call', async (apiCall) => {
  // 1. Rule engine evaluation
  const ruleResult = ruleEngine.evaluate(apiCall);

  // 2. Anomaly detection
  const anomalies = anomalyDetector.analyzeCall(apiCall);

  // 3. AML check for high-risk operations
  let amlResult = null;
  const highRiskTypes = ['SWAP_EXECUTE', 'TOKEN_APPROVAL', 'BRIDGE_EXECUTE', 'PAYMENT', 'FUTURES_ORDER', 'SPOT_ORDER'];
  if (highRiskTypes.includes(apiCall.classification?.type) && apiCall.wallet_address) {
    amlResult = await aml.checkAddress(apiCall.wallet_address, apiCall.chain_index || 'ETH');

    // Also check destination if it's a transfer
    if (apiCall.to_token && apiCall.to_token.startsWith('0x')) {
      const destCheck = await aml.checkAddress(apiCall.to_token, apiCall.chain_index || 'ETH');
      if (destCheck.risk_score > (amlResult?.risk_score || 0)) {
        amlResult = destCheck;
      }
    }
  }

  // 4. Merge all alerts
  const allAlerts = [...ruleResult.alerts];
  for (const a of anomalies) {
    allAlerts.push({
      rule_id: `ANOMALY_${a.type}`,
      rule_name: a.type,
      severity: a.severity,
      category: 'ANOMALY',
      description: a.detail,
    });
  }

  // Add AML alert if flagged
  if (amlResult && amlResult.is_flagged) {
    allAlerts.push({
      rule_id: 'AML_001',
      rule_name: 'AML 地址风险',
      severity: amlResult.risk_score >= 80 ? 'CRITICAL' : 'HIGH',
      category: 'AML',
      description: `${amlResult.labels.join(', ')} — 风险分: ${amlResult.risk_score}/100`,
    });
  }

  // 5. Set risk flags/score
  apiCall.risk_flags = JSON.stringify(allAlerts.map(a => a.rule_id));
  apiCall.risk_score = ruleResult.total_risk_score;
  if (amlResult?.is_flagged) {
    apiCall.risk_score = Math.min(100, apiCall.risk_score + amlResult.risk_score);
  }

  // 6. Save API log
  const logResult = dbOps.insertApiLog({
    agent_id: apiCall.agent_id,
    method: apiCall.method,
    url: apiCall.url,
    path: apiCall.path,
    query_params: apiCall.query_params,
    request_headers: apiCall.request_headers,
    request_body: apiCall.request_body,
    response_status: apiCall.response_status,
    response_body: apiCall.response_body?.substring(0, 2048) || null,
    duration_ms: apiCall.duration_ms,
    chain_index: apiCall.chain_index,
    from_token: apiCall.from_token,
    to_token: apiCall.to_token,
    amount: apiCall.amount,
    wallet_address: apiCall.wallet_address,
    slippage: apiCall.slippage,
    risk_flags: apiCall.risk_flags,
    risk_score: apiCall.risk_score,
  });

  // 7. Save alerts
  for (const alert of allAlerts) {
    dbOps.insertAlert({
      agent_id: apiCall.agent_id,
      rule_id: alert.rule_id,
      rule_name: alert.rule_name,
      severity: alert.severity,
      category: alert.category,
      description: alert.description,
      details: JSON.stringify(alert),
      api_log_id: logResult.lastInsertRowid,
    });

    riskScorer.applyAlert(apiCall.agent_id, alert);
  }

  // 8. Update agent score
  const newScore = riskScorer.calculateScore(apiCall.agent_id);
  const agentMeta = AGENTS[apiCall.agent_id] || {};
  dbOps.upsertAgent({
    id: apiCall.agent_id,
    name: agentMeta.display_name || apiCall.agent_id,
    version: agentMeta.version || '1.0.0',
    author: agentMeta.author || 'unknown',
    description: agentMeta.description || '',
    homepage: agentMeta.homepage || '',
    license: 'Apache-2.0',
    skills_count: agentMeta.skills_count || 0,
    risk_score: newScore.overall_score,
    risk_level: newScore.level,
    scan_result: null,
  });

  // 9. Broadcast to dashboard
  broadcast('api-call', {
    ...apiCall,
    alerts: allAlerts,
    risk_score: apiCall.risk_score,
    classification: apiCall.classification,
    aml_result: amlResult,
  });

  if (allAlerts.length > 0) {
    broadcast('alerts', allAlerts.map(a => ({ ...a, agent_id: apiCall.agent_id, timestamp: apiCall.timestamp })));
    broadcast('score-update', newScore);
  }
});

chainMonitor.on('chain-event', (event) => {
  dbOps.insertChainEvent(event);
  broadcast('chain-event', event);
});

// ═══════════════════════════════════════
//  REST API ROUTES
// ═══════════════════════════════════════

// --- Dashboard Stats ---
app.get('/api/stats', (req, res) => {
  const stats = dbOps.getDashboardStats();
  stats.aml = aml.getStats();
  res.json(stats);
});

// --- Agent List (multi-agent) ---
app.get('/api/agents', (req, res) => {
  const dbAgents = dbOps.getAllAgents();
  const simList = simulator.getAgentList();

  // Merge DB data with simulator runtime data
  const merged = dbAgents.map(a => {
    const sim = simList.find(s => s.id === a.id);
    return {
      ...a,
      status: sim ? 'RUNNING' : 'STOPPED',
      uptime_ms: sim?.uptime_ms || 0,
      api_calls_live: sim?.api_calls || 0,
      logo: AGENTS[a.id]?.logo || '🤖',
      chains: AGENTS[a.id]?.chains || [],
    };
  });

  res.json(merged);
});

app.get('/api/agents/:id', (req, res) => {
  const agent = dbOps.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const sim = simulator.getAgentList().find(s => s.id === req.params.id);
  res.json({
    ...agent,
    status: sim ? 'RUNNING' : 'STOPPED',
    uptime_ms: sim?.uptime_ms || 0,
    logo: AGENTS[req.params.id]?.logo || '🤖',
    chains: AGENTS[req.params.id]?.chains || [],
    skills_list: AGENTS[req.params.id]?.skills || [],
  });
});

app.get('/api/agents/:id/skills', (req, res) => {
  res.json(dbOps.getSkillsByAgent(req.params.id));
});

app.get('/api/agents/:id/score', (req, res) => {
  const score = riskScorer.calculateScore(req.params.id);
  res.json(score);
});

app.get('/api/agents/:id/score-history', (req, res) => {
  res.json(dbOps.getScoreHistory(req.params.id));
});

// --- Scan ---
app.get('/api/scan', (req, res) => {
  if (scanResults['onchainos-skills']) {
    res.json(scanResults['onchainos-skills']);
  } else {
    res.status(404).json({ error: 'No scan result available.' });
  }
});

app.post('/api/scan', (req, res) => {
  const targetPath = req.body.path || ONCHAINOS_PATH;
  try {
    const result = scanProject(targetPath);
    scanResults[result.agent?.id || 'manual-scan'] = result;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Auto-Discovery ---
app.get('/api/discovered', (req, res) => {
  res.json({
    packages: discoveredPackages,
    total: discoveredPackages.length,
    scan_results: Object.keys(scanResults).length,
  });
});

app.post('/api/discover', (req, res) => {
  const result = autoDiscover();
  res.json({
    packages: result,
    total: result.length,
    message: `Discovered ${result.length} Agent/Skill packages`,
  });
});

// --- API Logs ---
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  res.json(dbOps.getAllRecentApiLogs(limit));
});

app.get('/api/logs/:agentId', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(dbOps.getRecentApiLogs(req.params.agentId, limit));
});

// --- Alerts ---
app.get('/api/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(dbOps.getRecentAlerts(limit));
});

app.get('/api/alerts/:agentId', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(dbOps.getAlertsByAgent(req.params.agentId, limit));
});

// --- Chain Events ---
app.get('/api/chain-events', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(dbOps.getAllRecentChainEvents(limit));
});

app.get('/api/chain-events/:agentId', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(dbOps.getRecentChainEvents(req.params.agentId, limit));
});

// --- Risk Engine ---
app.get('/api/risk/rules', (req, res) => {
  res.json(ruleEngine.getStats());
});

app.get('/api/risk/baseline/:agentId', (req, res) => {
  res.json(anomalyDetector.getBaseline(req.params.agentId));
});

// --- AML ---
app.get('/api/aml/check/:address', async (req, res) => {
  const chain = req.query.chain || 'ETH';
  const result = await aml.checkAddress(req.params.address, chain);
  res.json(result);
});

app.get('/api/aml/stats', (req, res) => {
  res.json(aml.getStats());
});

app.post('/api/aml/pre-transfer', async (req, res) => {
  const { from, to, chain, amount } = req.body;
  const result = await aml.preTransferCheck(from, to, chain, amount);
  res.json(result);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     KYA — Know Your Agent 🛡️  v2.0         ║');
  console.log('║     Multi-Agent Security Monitor + AML      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Dashboard:  http://localhost:${PORT}            ║`);
  console.log(`║  API:        http://localhost:${PORT}/api        ║`);
  console.log(`║  WebSocket:  ws://localhost:${PORT}/ws          ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Auto-discover and scan all installed Agent/Skills
  autoDiscover();

  // Register simulated agents (for demo)
  registerSimulatedAgents();

  // Start multi-agent simulator
  simulator.start();

  // Start chain monitor
  chainMonitor.start();

  console.log(`\n🛡️  AML Engine: ${aml.useSimulation ? 'Simulation Mode' : 'MistTrack API Mode'}`);
  console.log(`📊 Monitoring ${Object.keys(AGENTS).length} agents`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down KYA Agent...');
  simulator.stop();
  chainMonitor.stop();
  wss.clients.forEach(client => client.close());
  server.close(() => {
    console.log('✅ Server closed gracefully.');
    process.exit(0);
  });
  // Force exit after 5s if graceful shutdown hangs
  setTimeout(() => process.exit(1), 5000);
});

process.on('SIGTERM', () => process.emit('SIGINT'));
