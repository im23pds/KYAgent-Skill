/**
 * KYA Dashboard — Multi-Agent Frontend + AML + i18n
 */

// ═══ Helpers (early) ═══
const _escEl = document.createElement('div');
function esc(str) { _escEl.textContent = str; return _escEl.innerHTML; }

// ═══ i18n ═══
let currentLang = localStorage.getItem('kya-lang') || 'en';
const i18n = {
  en: {
    monitoring_active:'Monitoring Active', connected:'Connected', disconnected:'Disconnected',
    tab_overview:'Overview', tab_api_monitor:'API Monitor', tab_risk_alerts:'Risk Alerts',
    tab_aml:'AML Anti-Fraud', tab_chain_activity:'Chain Activity',
    stat_monitored_agents:'Monitored Agents', stat_api_calls:'API Calls', stat_open_alerts:'Alerts',
    stat_critical_alerts:'Critical', stat_chain_events:'Chain Events', aml_checks:'AML Checks',
    aml_flagged:'AML Flagged', aml_total_checks:'Total AML Checks', aml_flagged_addrs:'Flagged Addresses',
    aml_mode:'Mode', aml_cache_size:'Cache Size', aml_address_check:'Address Risk Check',
    aml_integration:'Integration', aml_recent_checks:'Recent AML Checks', aml_check_btn:'Check',
    aml_waiting:'Waiting for AML checks...',
    card_risk_score:'Risk Score', card_recent_alerts:'Recent Alerts', card_live_stream:'Live API Stream',
    card_full_api_log:'Full API Log', card_all_alerts:'All Alerts', card_chain_events:'On-Chain Events',
    dim_credential:'Credential', dim_behavior:'Behavior', dim_transaction:'Transaction', dim_chain:'Chain',
    th_time:'Time', th_timestamp:'Timestamp', th_type:'Type', th_endpoint:'Endpoint', th_chain:'Chain',
    th_amount:'Amount', th_risk:'Risk', th_status:'Status', th_method:'Method', th_slippage:'Slippage',
    th_duration:'Duration', th_risk_score:'Risk', th_flags:'Flags', th_severity:'Severity',
    th_category:'Category', th_rule:'Rule', th_description:'Description', th_event:'Event',
    th_from:'From', th_to:'To', th_token:'Token', th_suspicious:'Suspicious', th_tx_hash:'Tx Hash',
    sev_critical:'Critical', sev_high:'High', sev_medium:'Medium', sev_low:'Low',
    waiting_events:'Waiting...', waiting_api:'Waiting...', loading:'Loading...',
    no_alerts:'No alerts', monitoring_chain:'Monitoring...', all_agents:'← All Agents',
    skills:'Skills', api_calls_label:'API Calls', risk_label:'Risk', uptime:'Uptime',
  },
  zh: {
    monitoring_active:'监控运行中', connected:'已连接', disconnected:'已断开',
    tab_overview:'总览', tab_api_monitor:'API 监控', tab_risk_alerts:'风险告警',
    tab_aml:'AML 反洗钱', tab_chain_activity:'链上活动',
    stat_monitored_agents:'监控的 Agent', stat_api_calls:'API 调用', stat_open_alerts:'告警',
    stat_critical_alerts:'严重', stat_chain_events:'链上事件', aml_checks:'AML 检查',
    aml_flagged:'AML 标记', aml_total_checks:'AML 检查总数', aml_flagged_addrs:'标记地址',
    aml_mode:'模式', aml_cache_size:'缓存大小', aml_address_check:'地址风险检测',
    aml_integration:'集成', aml_recent_checks:'最近 AML 检查', aml_check_btn:'检测',
    aml_waiting:'等待 AML 检查...',
    card_risk_score:'风险评分', card_recent_alerts:'最近告警', card_live_stream:'实时 API 流',
    card_full_api_log:'完整 API 日志', card_all_alerts:'全部告警', card_chain_events:'链上事件',
    dim_credential:'凭证安全', dim_behavior:'行为合规', dim_transaction:'交易安全', dim_chain:'链上风险',
    th_time:'时间', th_timestamp:'时间戳', th_type:'类型', th_endpoint:'端点', th_chain:'链',
    th_amount:'金额', th_risk:'风险', th_status:'状态', th_method:'方法', th_slippage:'滑点',
    th_duration:'耗时', th_risk_score:'风险', th_flags:'标记', th_severity:'严重度',
    th_category:'分类', th_rule:'规则', th_description:'描述', th_event:'事件',
    th_from:'来源', th_to:'目标', th_token:'代币', th_suspicious:'可疑', th_tx_hash:'交易哈希',
    sev_critical:'严重', sev_high:'高危', sev_medium:'中危', sev_low:'低危',
    waiting_events:'等待中...', waiting_api:'等待中...', loading:'加载中...',
    no_alerts:'暂无告警', monitoring_chain:'监控中...', all_agents:'← 全部 Agent',
    skills:'技能', api_calls_label:'API 调用', risk_label:'风险', uptime:'运行时长',
  },
};
function t(k) { return i18n[currentLang]?.[k] || i18n.en[k] || k; }
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const text = t(el.getAttribute('data-i18n'));
    if (text) el.textContent = text;
  });
  const flag = document.getElementById('lang-flag');
  const text = document.getElementById('lang-text');
  if (flag) flag.textContent = currentLang === 'zh' ? '🇨🇳' : '🇺🇸';
  if (text) text.textContent = currentLang === 'zh' ? '中文' : 'EN';
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
}
function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('kya-lang', currentLang);
  applyLang();
  if (state.currentView === 'home') loadAgentList();
}

// ═══ State ═══
const state = {
  ws: null, currentView: 'home', selectedAgentId: null,
  agents: [], alerts: [], apiCalls: [], amlResults: [],
  alertCounts: { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 },
};

// ═══ Init ═══
let _refreshTimer = null;
let _agentListTimer = null;
document.addEventListener('DOMContentLoaded', () => {
  applyLang();
  initTabs();
  initWebSocket();
  initClock();
  loadAgentList();
  refreshHomeStats();
  _refreshTimer = setInterval(refreshHomeStats, 5000);
  _agentListTimer = setInterval(() => { if (state.currentView === 'home') loadAgentList(); }, 8000);
});

// ═══ Navigation ═══
function showHome() {
  state.currentView = 'home';
  state.selectedAgentId = null;
  document.getElementById('home-view').style.display = '';
  document.getElementById('detail-view').style.display = 'none';
  loadAgentList();
  refreshHomeStats();
}

function showAgentDetail(agentId) {
  state.currentView = 'detail';
  state.selectedAgentId = agentId;
  document.getElementById('home-view').style.display = 'none';
  document.getElementById('detail-view').style.display = '';
  // Set breadcrumb
  const agent = state.agents.find(a => a.id === agentId);
  document.getElementById('breadcrumb-agent').textContent = agent?.name || agentId;
  // Reset tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab[data-tab="overview"]').classList.add('active');
  document.getElementById('tab-overview').classList.add('active');
  // Load data
  loadAgentOverview(agentId);
}

// ═══ Home: Agent List ═══
async function loadAgentList() {
  const agents = await api('/api/agents');
  if (!agents) return;
  state.agents = agents;

  const grid = document.getElementById('agent-cards-grid');
  grid.innerHTML = '';

  for (const agent of agents) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.onclick = () => showAgentDetail(agent.id);

    const uptime = formatUptime(agent.uptime_ms || 0);
    const riskColor = getScoreColor(agent.risk_score || 85);
    const statusClass = agent.status === 'RUNNING' ? 'running' : 'stopped';
    const chainTags = (agent.chains || []).map(c => `<span class="tag">${chains[c] || c}</span>`).join('');

    card.innerHTML = `
      <div class="agent-card-header">
        <div class="agent-logo"><img src="${esc(agent.logo || 'img/kya-logo.png')}" onerror="this.src='img/kya-logo.png'" alt="${esc(agent.name)}" class="agent-logo-img" loading="lazy"></div>
        <div class="agent-card-info">
          <div class="agent-card-name">${esc(agent.name)}</div>
          <div class="agent-card-author">by ${esc(agent.author)} · v${esc(agent.version)}</div>
        </div>
        <span class="agent-card-status ${statusClass}">${agent.status === 'RUNNING' ? '● LIVE' : '○ STOPPED'}</span>
      </div>
      <div class="agent-card-desc">${agent.description || ''}</div>
      <div class="agent-card-stats">
        <div class="agent-card-stat">
          <div class="agent-card-stat-value">${agent.skills_count || 0}</div>
          <div class="agent-card-stat-label">${t('skills')}</div>
        </div>
        <div class="agent-card-stat">
          <div class="agent-card-stat-value">${agent.api_calls_live || 0}</div>
          <div class="agent-card-stat-label">${t('api_calls_label')}</div>
        </div>
        <div class="agent-card-stat">
          <div class="agent-card-stat-value" style="color:${riskColor}">${agent.risk_score ?? '-'}</div>
          <div class="agent-card-stat-label">${t('risk_label')}</div>
        </div>
        <div class="agent-card-stat">
          <div class="agent-card-stat-value" style="font-size:13px">${uptime}</div>
          <div class="agent-card-stat-label">${t('uptime')}</div>
        </div>
      </div>
      <div class="agent-card-chains">${chainTags}</div>
    `;
    grid.appendChild(card);
  }
}

async function refreshHomeStats() {
  const stats = await api('/api/stats');
  if (!stats) return;
  document.getElementById('hs-agents').textContent = stats.totalAgents;
  document.getElementById('hs-calls').textContent = stats.totalApiCalls;
  document.getElementById('hs-alerts').textContent = stats.openAlerts;
  document.getElementById('hs-aml').textContent = stats.aml?.total_checks || 0;
}

// ═══ Agent Detail: Overview ═══
async function loadAgentOverview(agentId) {
  // Stats
  const stats = await api('/api/stats');
  if (stats) {
    document.getElementById('stat-api-calls').textContent = stats.totalApiCalls;
    document.getElementById('stat-alerts').textContent = stats.openAlerts;
    document.getElementById('stat-critical').textContent = stats.criticalAlerts;
    document.getElementById('stat-chain').textContent = stats.chainEvents;
    document.getElementById('stat-aml-flagged').textContent = stats.aml?.flagged_addresses || 0;
  }

  // Score
  const score = await api(`/api/agents/${agentId}/score`);
  if (score) updateScoreRing(score);

  // Recent alerts
  const alerts = await api(`/api/alerts/${agentId}`);
  if (alerts) {
    const timeline = document.getElementById('alerts-timeline');
    timeline.innerHTML = '';
    state.alertCounts = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 };
    for (const a of alerts.slice(0, 20)) {
      addAlertTimeline(a);
      state.alertCounts[a.severity] = (state.alertCounts[a.severity] || 0) + 1;
    }
    updateAlertBadge();
  }

  // Recent API logs
  const logs = await api(`/api/logs/${agentId}?limit=30`);
  if (logs && logs.length > 0) {
    state.apiCalls = logs;
    const tbody = document.getElementById('live-api-table');
    tbody.innerHTML = '';
    for (const log of logs.slice(0, 15)) updateLiveApiTable(log);
    updateApiCountBadge();
  }
}

// ═══ Clock ═══
function initClock() {
  const update = () => { const el = document.getElementById('clock'); if (el) el.textContent = new Date().toLocaleTimeString(); };
  update(); setInterval(update, 1000);
}

// ═══ Tabs ═══
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById(`tab-${target}`).classList.add('active');
      const agentId = state.selectedAgentId;
      if (target === 'api-monitor') loadApiLogs(agentId);
      if (target === 'risk-alerts') loadAlerts(agentId);
      if (target === 'chain-activity') loadChainEvents();
      if (target === 'aml') loadAmlTab();
    });
  });
}

// ═══ WebSocket ═══
let _wsBackoff = 1000;
function initWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);
  state.ws.onopen = () => {
    _wsBackoff = 1000; // reset backoff on success
    const b = document.getElementById('ws-badge');
    b.className = 'ws-status ws-connected';
    b.innerHTML = `⬤ <span data-i18n="connected">${t('connected')}</span>`;
  };
  state.ws.onclose = () => {
    const b = document.getElementById('ws-badge');
    b.className = 'ws-status ws-disconnected';
    b.innerHTML = `⬤ <span data-i18n="disconnected">${t('disconnected')}</span>`;
    setTimeout(initWebSocket, Math.min(_wsBackoff, 30000));
    _wsBackoff *= 1.5;
  };
  state.ws.onmessage = (evt) => {
    try { handleWsMessage(JSON.parse(evt.data)); } catch(e) { console.error('WS error:', e); }
  };
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'api-call':
      if (state.currentView === 'detail' && msg.data.agent_id === state.selectedAgentId) {
        state.apiCalls.unshift(msg.data);
        updateLiveApiTable(msg.data);
        updateApiCountBadge();
      }
      // Track AML results
      if (msg.data.aml_result && msg.data.aml_result.is_flagged) {
        state.amlResults.unshift({ ...msg.data.aml_result, agent_id: msg.data.agent_id, timestamp: msg.data.timestamp });
        if (state.amlResults.length > 50) state.amlResults.length = 50;
      }
      break;
    case 'alerts':
      for (const alert of msg.data) {
        if (state.currentView === 'detail' && alert.agent_id === state.selectedAgentId) {
          state.alertCounts[alert.severity] = (state.alertCounts[alert.severity] || 0) + 1;
          addAlertTimeline(alert);
          updateAlertBadge();
        }
      }
      break;
    case 'score-update':
      if (state.currentView === 'detail') updateScoreRing(msg.data);
      break;
  }
}

// ═══ Score Ring ═══
function updateScoreRing(score) {
  const ring = document.getElementById('score-ring-fill');
  const circumference = 2 * Math.PI * 60;
  const offset = circumference - (score.overall_score / 100) * circumference;
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = score.color || getScoreColor(score.overall_score);
  document.getElementById('score-number').textContent = score.overall_score;
  document.getElementById('score-number').style.color = score.color || getScoreColor(score.overall_score);
  const levelEl = document.getElementById('score-level');
  levelEl.textContent = score.level;
  levelEl.style.color = score.color || getScoreColor(score.overall_score);
  for (const dim of ['credential','behavior','transaction','chain']) {
    const val = score.scores?.[dim] ?? 0;
    const bar = document.getElementById(`bar-${dim}`);
    const valEl = document.getElementById(`val-${dim}`);
    if (bar) { bar.style.width = `${val}%`; bar.style.background = getScoreColor(val); }
    if (valEl) valEl.textContent = val;
  }
}

// ═══ Live API Table ═══
function updateLiveApiTable(call) {
  const tbody = document.getElementById('live-api-table');
  if (tbody.querySelector('.empty-state')) tbody.innerHTML = '';
  const tr = document.createElement('tr');
  const time = new Date(call.timestamp).toLocaleTimeString();
  const type = call.classification?.type || 'UNKNOWN';
  const risk = call.classification?.risk || 'LOW';
  const pathShort = call.path?.replace(/\/api\/v\d+\/(dex\/aggregator\/|dex\/|wallet\/)?/g, '') || '-';
  const chain = call.chain_index ? (chains[call.chain_index] || call.chain_index) : '-';
  const amount = call.amount ? formatAmount(call.amount) : '-';
  const amlBadge = call.aml_result?.is_flagged
    ? `<span class="severity severity-${call.aml_result.risk_score >= 80 ? 'CRITICAL' : 'HIGH'}">⚠ AML</span>`
    : '<span style="color:var(--green);font-size:11px">✓</span>';

  tr.innerHTML = `
    <td style="font-family:var(--font-mono);font-size:11px">${time}</td>
    <td><span class="tag">${type}</span></td>
    <td style="font-family:var(--font-mono);font-size:11px">${pathShort}</td>
    <td>${chain}</td>
    <td>${amount}</td>
    <td><span class="severity severity-${risk === 'CRITICAL' ? 'CRITICAL' : risk}">${risk}</span></td>
    <td>${amlBadge}</td>
    <td>${call.response_status ? `<span style="color:${call.response_status < 400 ? 'var(--green)' : 'var(--red)'}">${call.response_status}</span>` : '-'}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);
  while (tbody.children.length > 20) tbody.removeChild(tbody.lastChild);
}

// ═══ Alert Timeline ═══
function addAlertTimeline(alert) {
  const timeline = document.getElementById('alerts-timeline');
  if (timeline.querySelector('.empty-state')) timeline.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'timeline-item';
  const sev = (alert.severity || 'LOW').toLowerCase();
  const time = new Date(alert.timestamp || Date.now()).toLocaleTimeString();
  const isAml = alert.category === 'AML';
  item.innerHTML = `
    <div class="timeline-dot ${sev}"></div>
    <div class="timeline-content">
      <div class="timeline-title">${isAml ? '🔒 ' : ''}${alert.rule_name || alert.rule_id}</div>
      <div class="timeline-desc">${alert.description || ''}</div>
    </div>
    <div class="timeline-time">${time}</div>
  `;
  timeline.insertBefore(item, timeline.firstChild);
  while (timeline.children.length > 30) timeline.removeChild(timeline.lastChild);
}

// ═══ Full API Logs ═══
async function loadApiLogs(agentId) {
  const url = agentId ? `/api/logs/${agentId}?limit=200` : '/api/logs?limit=200';
  const logs = await api(url);
  if (!logs) return;
  const tbody = document.getElementById('full-api-table');
  tbody.innerHTML = '';
  for (const log of logs) {
    const tr = document.createElement('tr');
    const pathShort = log.path?.replace(/\/api\/v\d+\/(dex\/aggregator\/|dex\/|wallet\/)?/g, '') || '-';
    const flags = log.risk_flags ? JSON.parse(log.risk_flags) : [];
    tr.innerHTML = `
      <td style="font-family:var(--font-mono);font-size:11px">${new Date(log.timestamp).toLocaleString()}</td>
      <td><span class="tag">${log.method}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px" title="${log.url}">${pathShort}</td>
      <td>${log.chain_index ? (chains[log.chain_index] || log.chain_index) : '-'}</td>
      <td>${log.amount ? formatAmount(log.amount) : '-'}</td>
      <td>${log.slippage ? log.slippage + '%' : '-'}</td>
      <td>${log.response_status ? `<span style="color:${log.response_status < 400 ? 'var(--green)' : 'var(--red)'}">${log.response_status}</span>` : '-'}</td>
      <td>${log.duration_ms ? log.duration_ms + 'ms' : '-'}</td>
      <td><span class="severity severity-${getRiskLevel(log.risk_score)}">${log.risk_score || 0}</span></td>
      <td>${flags.length > 0 ? flags.map(f => `<span class="tag tag-danger">${f}</span>`).join('') : '-'}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ═══ Full Alerts ═══
async function loadAlerts(agentId) {
  const url = agentId ? `/api/alerts/${agentId}` : '/api/alerts';
  const alerts = await api(url);
  if (!alerts) return;
  const counts = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 };
  for (const a of alerts) counts[a.severity] = (counts[a.severity] || 0) + 1;
  document.getElementById('alert-critical').textContent = counts.CRITICAL;
  document.getElementById('alert-high').textContent = counts.HIGH;
  document.getElementById('alert-medium').textContent = counts.MEDIUM;
  document.getElementById('alert-low').textContent = counts.LOW;
  const tbody = document.getElementById('alerts-full-table');
  tbody.innerHTML = '';
  for (const a of alerts) {
    const tr = document.createElement('tr');
    const isAml = a.category === 'AML';
    tr.innerHTML = `
      <td style="font-family:var(--font-mono);font-size:11px">${new Date(a.timestamp).toLocaleString()}</td>
      <td><span class="severity severity-${a.severity}">${a.severity}</span></td>
      <td><span class="tag ${isAml ? 'tag-warn' : ''}">${isAml ? '🔒 ' : ''}${a.category}</span></td>
      <td>${a.rule_name}</td>
      <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis">${a.description}</td>
      <td><span class="tag tag-${a.status === 'OPEN' ? 'danger' : 'success'}">${a.status}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

// ═══ Chain Events ═══
async function loadChainEvents() {
  const events = await api('/api/chain-events');
  if (!events) return;
  const tbody = document.getElementById('chain-events-table');
  tbody.innerHTML = '';
  for (const e of events) {
    const tr = document.createElement('tr');
    const details = e.details ? JSON.parse(e.details) : {};
    tr.innerHTML = `
      <td style="font-family:var(--font-mono);font-size:11px">${new Date(e.timestamp).toLocaleString()}</td>
      <td>${e.chain}</td>
      <td><span class="tag">${e.event_type}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px">${truncAddr(e.from_address)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${truncAddr(e.to_address)}</td>
      <td>${details.token_symbol || truncAddr(e.token_address)}</td>
      <td>${e.amount}</td>
      <td>${e.is_suspicious ? '<span class="severity severity-HIGH">⚠️ Yes</span>' : '<span class="severity severity-LOW">No</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${truncAddr(e.tx_hash)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ═══ AML Tab ═══
async function loadAmlTab() {
  const stats = await api('/api/aml/stats');
  if (stats) {
    document.getElementById('aml-total').textContent = stats.total_checks;
    document.getElementById('aml-flagged').textContent = stats.flagged_addresses;
    document.getElementById('aml-mode').textContent = stats.mode;
    document.getElementById('aml-cache').textContent = stats.cache_size;
  }
  // Render recent AML results from WS events
  const timeline = document.getElementById('aml-timeline');
  if (state.amlResults.length > 0) {
    timeline.innerHTML = '';
    for (const r of state.amlResults.slice(0, 20)) {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      const sev = r.risk_score >= 80 ? 'critical' : r.risk_score >= 50 ? 'high' : r.risk_score >= 30 ? 'medium' : 'low';
      item.innerHTML = `
        <div class="timeline-dot ${sev}"></div>
        <div class="timeline-content">
          <div class="timeline-title">🔒 ${r.labels?.join(', ') || 'Unknown'}</div>
          <div class="timeline-desc">${truncAddr(r.address)} · ${r.chain} · Risk: ${r.risk_score}/100 · ${r.entity_type}</div>
        </div>
        <div class="timeline-time">${new Date(r.timestamp || r.details?.checked_at).toLocaleTimeString()}</div>
      `;
      timeline.appendChild(item);
    }
  }
}

async function checkAmlAddress() {
  const address = document.getElementById('aml-address-input').value.trim();
  if (!address) return;
  const chain = document.getElementById('aml-chain-select').value;
  const result = await api(`/api/aml/check/${address}?chain=${chain}`);
  if (!result) return;

  const riskClass = result.risk_score >= 80 ? 'risk-critical'
    : result.risk_score >= 50 ? 'risk-high'
    : result.risk_score >= 30 ? 'risk-medium' : 'risk-low';

  document.getElementById('aml-result').innerHTML = `
    <div class="aml-result-card ${riskClass}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-weight:600;font-size:14px">${result.risk_level}</div>
          <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${truncAddr(result.address)} · ${result.chain}</div>
        </div>
        <div style="font-size:32px;font-weight:700;color:${getScoreColor(100 - result.risk_score)}">${result.risk_score}</div>
      </div>
      <div style="margin-bottom:8px">
        <strong style="font-size:12px;color:var(--text-muted)">Labels:</strong>
        ${result.labels.map(l => `<span class="tag ${result.risk_score >= 50 ? 'tag-danger' : ''}">${l}</span>`).join(' ')}
      </div>
      <div style="font-size:12px;color:var(--text-muted)">
        Entity: <strong>${result.entity_type}</strong> ·
        Threat Intel: ${result.details?.threat_intel_matches || 0} ·
        Connected Risk: ${result.details?.connected_risk_entities || 0} ·
        Source: ${result.details?.source || 'N/A'}
      </div>
    </div>
  `;
}

// ═══ API Helper ═══
async function api(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`API error ${path}:`, e);
    return null;
  }
}

// ═══ Helpers ═══
const chains = {
  '1':'🔷 ETH', '56':'🟡 BSC', '196':'🟣 XLayer', '501':'🟣 Solana',
  '8453':'🔵 Base', '42161':'🔵 Arb', '137':'🟣 Polygon', '10':'🔴 OP',
};

function truncAddr(addr) { if (!addr || addr.length < 12) return addr || '-'; return addr.substring(0,6) + '...' + addr.substring(addr.length-4); }
function formatAmount(amount) {
  if (amount === 'UNLIMITED') return '<span class="severity severity-CRITICAL">♾️ UNLIMITED</span>';
  try { const n = BigInt(amount); if (n > BigInt('1000000000000000000')) return (Number(n)/1e18).toFixed(4); if (n > BigInt('1000000000')) return (Number(n)/1e9).toFixed(4); if (n > BigInt('1000000')) return (Number(n)/1e6).toFixed(2); return amount; } catch { return amount; }
}
// v3: inverted — 0=safe(green), 100=dangerous(red)
function getScoreColor(score) { if (score <= 20) return '#22c55e'; if (score <= 40) return '#eab308'; if (score <= 60) return '#f97316'; return '#ef4444'; }
function getRiskLevel(score) { if (score >= 70) return 'CRITICAL'; if (score >= 40) return 'HIGH'; if (score >= 15) return 'MEDIUM'; return 'LOW'; }
function formatUptime(ms) {
  if (ms < 60000) return Math.floor(ms/1000) + 's';
  if (ms < 3600000) return Math.floor(ms/60000) + 'm';
  return Math.floor(ms/3600000) + 'h ' + Math.floor((ms%3600000)/60000) + 'm';
}
function updateAlertBadge() {
  const total = Object.values(state.alertCounts).reduce((a,b) => a+b, 0);
  document.getElementById('alert-count-badge').textContent = total;
}
function updateApiCountBadge() {
  document.getElementById('api-count-badge').textContent = state.apiCalls.length;
}
