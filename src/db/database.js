/**
 * KYA Agent — Database Layer
 * SQLite storage for agent metadata, API logs, alerts, chain events, scores
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'kya.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    -- Agent 元数据
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT,
      author TEXT,
      description TEXT,
      homepage TEXT,
      license TEXT,
      skills_count INTEGER DEFAULT 0,
      risk_score REAL DEFAULT 50,
      risk_level TEXT DEFAULT 'MEDIUM',
      scan_result TEXT,  -- JSON: 完整扫描结果
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    );

    -- Skill 详情
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      api_endpoints TEXT,   -- JSON array
      permissions TEXT,     -- JSON array
      credential_risks TEXT, -- JSON array
      prompt_injection_risk REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- API 调用日志
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      method TEXT,
      url TEXT,
      path TEXT,
      query_params TEXT,   -- JSON
      request_headers TEXT, -- JSON
      request_body TEXT,
      response_status INTEGER,
      response_body TEXT,
      duration_ms INTEGER,
      -- 提取的关键字段
      chain_index TEXT,
      from_token TEXT,
      to_token TEXT,
      amount TEXT,
      wallet_address TEXT,
      slippage TEXT,
      -- 风控标记
      risk_flags TEXT,     -- JSON array of triggered rules
      risk_score REAL DEFAULT 0
    );

    -- 风控告警
    CREATE TABLE IF NOT EXISTS risk_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      rule_id TEXT,
      rule_name TEXT,
      severity TEXT,  -- LOW / MEDIUM / HIGH / CRITICAL
      category TEXT,  -- FREQUENCY / AMOUNT / BEHAVIOR / BLACKLIST / APPROVAL / CHAIN
      description TEXT,
      details TEXT,   -- JSON
      api_log_id INTEGER,
      status TEXT DEFAULT 'OPEN',  -- OPEN / ACKNOWLEDGED / RESOLVED / FALSE_POSITIVE
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (api_log_id) REFERENCES api_logs(id)
    );

    -- 链上事件
    CREATE TABLE IF NOT EXISTS chain_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      chain TEXT,
      tx_hash TEXT,
      event_type TEXT,  -- TRANSFER / APPROVAL / SWAP / CONTRACT_CALL
      from_address TEXT,
      to_address TEXT,
      token_address TEXT,
      amount TEXT,
      amount_usd REAL,
      is_suspicious INTEGER DEFAULT 0,
      details TEXT,  -- JSON
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- Agent 风险评分历史
    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      overall_score REAL,
      credential_score REAL,
      behavior_score REAL,
      transaction_score REAL,
      chain_score REAL,
      details TEXT,  -- JSON
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_api_logs_agent ON api_logs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_api_logs_time ON api_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_agent ON risk_alerts(agent_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON risk_alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_chain_events_agent ON chain_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_score_history_agent ON score_history(agent_id);
  `);
}

// === CRUD Helpers ===

const dbOps = {
  // --- Agents ---
  upsertAgent(agent) {
    const stmt = getDb().prepare(`
      INSERT INTO agents (id, name, version, author, description, homepage, license, skills_count, risk_score, risk_level, scan_result)
      VALUES (@id, @name, @version, @author, @description, @homepage, @license, @skills_count, @risk_score, @risk_level, @scan_result)
      ON CONFLICT(id) DO UPDATE SET
        name=@name, version=@version, author=@author, description=@description,
        homepage=@homepage, license=@license, skills_count=@skills_count,
        risk_score=@risk_score, risk_level=@risk_level, scan_result=@scan_result,
        last_seen=datetime('now')
    `);
    return stmt.run(agent);
  },

  getAgent(id) {
    return getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id);
  },

  getAllAgents() {
    return getDb().prepare('SELECT * FROM agents ORDER BY last_seen DESC').all();
  },

  // --- Skills ---
  insertSkill(skill) {
    const stmt = getDb().prepare(`
      INSERT INTO skills (agent_id, name, description, api_endpoints, permissions, credential_risks, prompt_injection_risk)
      VALUES (@agent_id, @name, @description, @api_endpoints, @permissions, @credential_risks, @prompt_injection_risk)
    `);
    return stmt.run(skill);
  },

  getSkillsByAgent(agentId) {
    return getDb().prepare('SELECT * FROM skills WHERE agent_id = ?').all(agentId);
  },

  // --- API Logs ---
  insertApiLog(log) {
    const stmt = getDb().prepare(`
      INSERT INTO api_logs (agent_id, method, url, path, query_params, request_headers, request_body,
        response_status, response_body, duration_ms, chain_index, from_token, to_token, amount,
        wallet_address, slippage, risk_flags, risk_score)
      VALUES (@agent_id, @method, @url, @path, @query_params, @request_headers, @request_body,
        @response_status, @response_body, @duration_ms, @chain_index, @from_token, @to_token, @amount,
        @wallet_address, @slippage, @risk_flags, @risk_score)
    `);
    return stmt.run(log);
  },

  getRecentApiLogs(agentId, limit = 100) {
    return getDb().prepare(
      'SELECT * FROM api_logs WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(agentId, limit);
  },

  getAllRecentApiLogs(limit = 200) {
    return getDb().prepare(
      'SELECT * FROM api_logs ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  },

  // --- Alerts ---
  insertAlert(alert) {
    const stmt = getDb().prepare(`
      INSERT INTO risk_alerts (agent_id, rule_id, rule_name, severity, category, description, details, api_log_id)
      VALUES (@agent_id, @rule_id, @rule_name, @severity, @category, @description, @details, @api_log_id)
    `);
    return stmt.run(alert);
  },

  getRecentAlerts(limit = 100) {
    return getDb().prepare(
      'SELECT * FROM risk_alerts ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  },

  getAlertsByAgent(agentId, limit = 50) {
    return getDb().prepare(
      'SELECT * FROM risk_alerts WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(agentId, limit);
  },

  getAlertStats() {
    return getDb().prepare(`
      SELECT severity, COUNT(*) as count FROM risk_alerts
      WHERE status = 'OPEN' GROUP BY severity
    `).all();
  },

  // --- Chain Events ---
  insertChainEvent(event) {
    const stmt = getDb().prepare(`
      INSERT INTO chain_events (agent_id, chain, tx_hash, event_type, from_address, to_address,
        token_address, amount, amount_usd, is_suspicious, details)
      VALUES (@agent_id, @chain, @tx_hash, @event_type, @from_address, @to_address,
        @token_address, @amount, @amount_usd, @is_suspicious, @details)
    `);
    return stmt.run(event);
  },

  getRecentChainEvents(agentId, limit = 50) {
    return getDb().prepare(
      'SELECT * FROM chain_events WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(agentId, limit);
  },

  getAllRecentChainEvents(limit = 100) {
    return getDb().prepare(
      'SELECT * FROM chain_events ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  },

  // --- Scores ---
  insertScore(score) {
    const stmt = getDb().prepare(`
      INSERT INTO score_history (agent_id, overall_score, credential_score, behavior_score,
        transaction_score, chain_score, details)
      VALUES (@agent_id, @overall_score, @credential_score, @behavior_score,
        @transaction_score, @chain_score, @details)
    `);
    return stmt.run(score);
  },

  getScoreHistory(agentId, limit = 50) {
    return getDb().prepare(
      'SELECT * FROM score_history WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(agentId, limit);
  },

  // --- Stats ---
  getDashboardStats() {
    const d = getDb();
    return {
      totalAgents: d.prepare('SELECT COUNT(*) as c FROM agents').get().c,
      totalApiCalls: d.prepare('SELECT COUNT(*) as c FROM api_logs').get().c,
      openAlerts: d.prepare("SELECT COUNT(*) as c FROM risk_alerts WHERE status='OPEN'").get().c,
      criticalAlerts: d.prepare("SELECT COUNT(*) as c FROM risk_alerts WHERE severity='CRITICAL' AND status='OPEN'").get().c,
      chainEvents: d.prepare('SELECT COUNT(*) as c FROM chain_events').get().c,
      alertsBySeverity: d.prepare("SELECT severity, COUNT(*) as count FROM risk_alerts WHERE status='OPEN' GROUP BY severity").all(),
      recentApiRate: d.prepare("SELECT COUNT(*) as c FROM api_logs WHERE timestamp > datetime('now', '-1 hour')").get().c,
    };
  },
};

module.exports = { getDb, dbOps };
