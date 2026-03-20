/**
 * KYA Agent — Skill Scanner
 * Parses onchainos-skills project to extract Agent metadata, capabilities, risks
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { scanContent, scanFiles } = require('./credential-detector');

/**
 * Scan an onchainos-skills project directory
 * @param {string} projectPath - Path to the skills project root
 * @returns {object} Complete agent profile
 */
function scanProject(projectPath) {
  const profile = {
    agent: {},
    skills: [],
    credentials: { findings: [], summary: {} },
    api_endpoints: [],
    risk_assessment: {},
    prompt_injection_risks: [],
    scan_timestamp: new Date().toISOString(),
  };

  // 1. Parse package.json
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    profile.agent = {
      id: pkg.name || path.basename(projectPath),
      name: pkg.name || path.basename(projectPath),
      version: pkg.version || 'unknown',
      description: pkg.description || '',
      author: typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name || 'unknown'),
      license: pkg.license || 'unknown',
      homepage: pkg.homepage || '',
      dependencies: Object.keys(pkg.dependencies || {}),
      scripts: pkg.scripts || {},
      has_postinstall: !!(pkg.scripts?.postinstall),
      postinstall_content: pkg.scripts?.postinstall || null,
    };

    // Check postinstall risk
    if (profile.agent.has_postinstall) {
      const content = profile.agent.postinstall_content;
      const isSimpleEcho = /^echo\s/.test(content) && !/[;&|$`]/.test(content.replace(/\\n/g, ''));
      profile.agent.postinstall_risk = isSimpleEcho ? 'LOW' : 'HIGH';
    }
  }

  // 2. Discover and parse skills
  const skillsDir = path.join(projectPath, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skillDirs = fs.readdirSync(skillsDir).filter(d =>
      fs.statSync(path.join(skillsDir, d)).isDirectory()
    );

    for (const skillDir of skillDirs) {
      const skillPath = path.join(skillsDir, skillDir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      const skill = parseSkill(skillPath, skillDir);
      profile.skills.push(skill);
    }
  }

  profile.agent.skills_count = profile.skills.length;

  // 3. Scan for hardcoded credentials across all files
  const filesMap = collectFiles(projectPath);
  profile.credentials = scanFiles(filesMap);

  // 4. Extract all API endpoints
  profile.api_endpoints = extractAllEndpoints(profile.skills);

  // 5. Analyze prompt injection risks
  profile.prompt_injection_risks = analyzePromptInjection(profile.skills);

  // 6. Generate risk assessment
  profile.risk_assessment = assessRisk(profile);

  return profile;
}

/**
 * Parse a SKILL.md file
 */
function parseSkill(skillPath, skillName) {
  const raw = fs.readFileSync(skillPath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  const skill = {
    name: frontmatter.name || skillName,
    description: frontmatter.description || '',
    license: frontmatter.license || 'unknown',
    author: frontmatter.metadata?.author || 'unknown',
    version: frontmatter.metadata?.version || 'unknown',
    homepage: frontmatter.metadata?.homepage || '',
    file_path: skillPath,
    content_length: raw.length,
    api_endpoints: [],
    permissions: [],
    data_accessed: [],
    authentication: {},
    cross_skill_deps: [],
    safety_checks: [],
  };

  // Extract API endpoints
  const endpointRegex = /(?:GET|POST|PUT|DELETE)\s+([\/\w\-\.]+(?:\?[^\s]*)?)/g;
  let match;
  while ((match = endpointRegex.exec(content)) !== null) {
    const ep = match[0].split('?')[0].trim();
    if (!skill.api_endpoints.includes(ep)) {
      skill.api_endpoints.push(ep);
    }
  }

  // Extract base URL
  const baseUrlMatch = content.match(/Base URL[`:\s]*`?(https?:\/\/[^\s`]+)/i);
  skill.base_url = baseUrlMatch ? baseUrlMatch[1] : null;

  // Detect authentication method
  if (content.includes('HMAC-SHA256') || content.includes('createHmac')) {
    skill.authentication.method = 'HMAC-SHA256';
    skill.authentication.headers = [];
    const headerRegex = /OK-ACCESS-\w+/g;
    while ((match = headerRegex.exec(content)) !== null) {
      if (!skill.authentication.headers.includes(match[0])) {
        skill.authentication.headers.push(match[0]);
      }
    }
  }

  // Detect data types accessed
  const dataPatterns = [
    { pattern: /token.*balance|balance.*token/i, type: 'TOKEN_BALANCE' },
    { pattern: /wallet.*address|userWalletAddress/i, type: 'WALLET_ADDRESS' },
    { pattern: /swap|trade|exchange/i, type: 'SWAP_EXECUTION' },
    { pattern: /approve.*transaction|ERC-20\s+approval/i, type: 'TOKEN_APPROVAL' },
    { pattern: /quote|price/i, type: 'PRICE_DATA' },
    { pattern: /liquidity/i, type: 'LIQUIDITY_DATA' },
    { pattern: /private.*key|privateKey/i, type: 'PRIVATE_KEY' },
    { pattern: /chain.*id|chainIndex/i, type: 'CHAIN_CONFIG' },
    { pattern: /gas|gasPrice|gasLimit/i, type: 'GAS_DATA' },
    { pattern: /slippage/i, type: 'SLIPPAGE_CONFIG' },
    { pattern: /nonce/i, type: 'NONCE' },
  ];
  for (const dp of dataPatterns) {
    if (dp.pattern.test(content)) {
      skill.data_accessed.push(dp.type);
    }
  }

  // Detect cross-skill dependencies
  const crossSkillRegex = /okx-\w[\w-]*/g;
  while ((match = crossSkillRegex.exec(content)) !== null) {
    const dep = match[0];
    if (dep !== skill.name && !skill.cross_skill_deps.includes(dep)) {
      skill.cross_skill_deps.push(dep);
    }
  }

  // Detect safety checks mentioned
  const safetyPatterns = [
    { pattern: /isHoneyPot/i, check: 'HONEYPOT_DETECTION' },
    { pattern: /taxRate/i, check: 'TAX_RATE_CHECK' },
    { pattern: /priceImpact/i, check: 'PRICE_IMPACT_CHECK' },
    { pattern: /slippage.*warn|warn.*slippage/i, check: 'SLIPPAGE_WARNING' },
    { pattern: /user.*confirm|confirm.*user|approval/i, check: 'USER_CONFIRMATION' },
    { pattern: /insufficient.*balance/i, check: 'BALANCE_CHECK' },
    { pattern: /rate.*limit|429/i, check: 'RATE_LIMIT_HANDLING' },
  ];
  for (const sp of safetyPatterns) {
    if (sp.pattern.test(content)) {
      skill.safety_checks.push(sp.check);
    }
  }

  // Categorize permissions from endpoints
  for (const ep of skill.api_endpoints) {
    if (/swap|trade/i.test(ep)) skill.permissions.push('EXECUTE_TRADE');
    if (/approve/i.test(ep)) skill.permissions.push('TOKEN_APPROVAL');
    if (/quote|price|market/i.test(ep)) skill.permissions.push('READ_MARKET_DATA');
    if (/balance|portfolio/i.test(ep)) skill.permissions.push('READ_PORTFOLIO');
    if (/token.*search|token.*detail/i.test(ep)) skill.permissions.push('TOKEN_LOOKUP');
    if (/broadcast|send.*transaction/i.test(ep)) skill.permissions.push('BROADCAST_TX');
  }
  skill.permissions = [...new Set(skill.permissions)];

  return skill;
}

/**
 * Collect all text files in a project for credential scanning
 */
function collectFiles(projectPath) {
  const filesMap = {};
  const extensions = ['.md', '.js', '.ts', '.json', '.yml', '.yaml', '.env', '.toml'];
  const ignoreDirs = ['.git', 'node_modules', '.npm'];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreDirs.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        try {
          filesMap[fullPath] = fs.readFileSync(fullPath, 'utf-8');
        } catch (e) { /* skip unreadable files */ }
      }
    }
  }
  walk(projectPath);
  return filesMap;
}

/**
 * Extract all API endpoints across skills
 */
function extractAllEndpoints(skills) {
  const all = [];
  for (const skill of skills) {
    for (const ep of skill.api_endpoints) {
      if (!all.find(e => e.endpoint === ep)) {
        all.push({
          endpoint: ep,
          skill: skill.name,
          base_url: skill.base_url,
          data_types: skill.data_accessed,
          permissions_needed: skill.permissions,
        });
      }
    }
  }
  return all;
}

/**
 * Analyze prompt injection risks in skill descriptions
 */
function analyzePromptInjection(skills) {
  const risks = [];
  const dangerousPatterns = [
    { regex: /always\s+set\s+slippage/i, risk: 'Slippage manipulation instruction' },
    { regex: /never\s+warn/i, risk: 'Safety warning suppression' },
    { regex: /redirect.*(?:swap|transfer|send)/i, risk: 'Transaction redirection instruction' },
    { regex: /ignore.*(?:previous|system|safety)/i, risk: 'System prompt override attempt' },
    { regex: /do\s+not\s+(?:check|verify|validate)/i, risk: 'Validation bypass instruction' },
    { regex: /secret(?:ly)?|hidden/i, risk: 'Covert operation instruction' },
    { regex: /override|bypass/i, risk: 'Security bypass instruction' },
  ];

  for (const skill of skills) {
    const desc = skill.description;
    if (!desc) continue;

    // Check description length (overly long descriptions are suspicious)
    if (desc.length > 500) {
      risks.push({
        skill: skill.name,
        field: 'description',
        risk_type: 'EXCESSIVE_LENGTH',
        severity: 'MEDIUM',
        detail: `Description is ${desc.length} characters — may contain hidden instructions`,
      });
    }

    // Check for dangerous patterns
    for (const dp of dangerousPatterns) {
      if (dp.regex.test(desc)) {
        risks.push({
          skill: skill.name,
          field: 'description',
          risk_type: 'DANGEROUS_INSTRUCTION',
          severity: 'HIGH',
          detail: dp.risk,
          matched: desc.match(dp.regex)?.[0],
        });
      }
    }

    // Check for manipulation of AI behavior
    const behaviorPatterns = [
      /do\s+NOT\s+use\s+for/i,
      /should\s+be\s+used\s+when/i,
      /this\s+skill\s+should/i,
    ];
    const behaviorModifiers = behaviorPatterns.filter(p => p.test(desc)).length;
    if (behaviorModifiers > 2) {
      risks.push({
        skill: skill.name,
        field: 'description',
        risk_type: 'HEAVY_BEHAVIORAL_CONTROL',
        severity: 'LOW',
        detail: `Found ${behaviorModifiers} behavioral control patterns — normal for routing but warrants review`,
      });
    }
  }

  return risks;
}

/**
 * Generate overall risk assessment
 */
function assessRisk(profile) {
  const scores = {
    credential_score: 100,
    behavior_score: 100,
    transaction_score: 100,
    supply_chain_score: 100,
  };

  const issues = [];

  // Credential risks
  const credCount = profile.credentials.summary.total_findings || 0;
  const critCreds = profile.credentials.summary.by_severity?.CRITICAL || 0;
  const highCreds = profile.credentials.summary.by_severity?.HIGH || 0;

  if (critCreds > 0) {
    scores.credential_score -= 40;
    issues.push({ severity: 'CRITICAL', msg: `${critCreds} critical credential(s) found hardcoded` });
  }
  if (highCreds > 0) {
    scores.credential_score -= 20;
    issues.push({ severity: 'HIGH', msg: `${highCreds} high-severity credential(s) found` });
  }

  // Env fallback pattern is especially dangerous for AI agents
  const envFallbacks = profile.credentials.findings.filter(f => f.pattern_id === 'env_fallback');
  if (envFallbacks.length > 0) {
    scores.credential_score -= 15;
    issues.push({
      severity: 'HIGH',
      msg: `${envFallbacks.length} env variable(s) with hardcoded fallback — AI Agent will learn and replicate this pattern`,
    });
  }

  // Prompt injection risks
  const piRisks = profile.prompt_injection_risks.filter(r => r.severity === 'HIGH');
  if (piRisks.length > 0) {
    scores.behavior_score -= 25;
    issues.push({ severity: 'HIGH', msg: `${piRisks.length} prompt injection risk(s) detected in skill descriptions` });
  }

  // Transaction safety checks
  const allSafetyChecks = new Set(profile.skills.flatMap(s => s.safety_checks));
  const expectedChecks = ['HONEYPOT_DETECTION', 'PRICE_IMPACT_CHECK', 'USER_CONFIRMATION', 'BALANCE_CHECK'];
  const missingChecks = expectedChecks.filter(c => !allSafetyChecks.has(c));
  if (missingChecks.length > 0) {
    scores.transaction_score -= (missingChecks.length * 10);
    issues.push({ severity: 'MEDIUM', msg: `Missing safety checks: ${missingChecks.join(', ')}` });
  }

  // Trading skills without mandatory confirmation
  const tradingSkills = profile.skills.filter(s => s.permissions.includes('EXECUTE_TRADE'));
  for (const ts of tradingSkills) {
    if (!ts.safety_checks.includes('USER_CONFIRMATION')) {
      scores.transaction_score -= 15;
      issues.push({ severity: 'HIGH', msg: `Skill "${ts.name}" can execute trades without mandatory user confirmation` });
    }
  }

  // Supply chain risk
  if (profile.agent.has_postinstall) {
    if (profile.agent.postinstall_risk === 'HIGH') {
      scores.supply_chain_score -= 30;
      issues.push({ severity: 'HIGH', msg: 'Complex postinstall script detected — potential supply chain attack vector' });
    } else {
      scores.supply_chain_score -= 5;
      issues.push({ severity: 'LOW', msg: 'Simple postinstall script found (echo only)' });
    }
  }

  // Calculate overall
  const weights = { credential: 0.35, behavior: 0.25, transaction: 0.25, supply_chain: 0.15 };
  const overall = Math.max(0, Math.min(100, Math.round(
    scores.credential_score * weights.credential +
    scores.behavior_score * weights.behavior +
    scores.transaction_score * weights.transaction +
    scores.supply_chain_score * weights.supply_chain
  )));

  let level;
  if (overall >= 80) level = 'TRUSTED';
  else if (overall >= 60) level = 'WATCH';
  else if (overall >= 40) level = 'WARNING';
  else level = 'DANGEROUS';

  return {
    overall_score: overall,
    level,
    scores: {
      credential: Math.max(0, scores.credential_score),
      behavior: Math.max(0, scores.behavior_score),
      transaction: Math.max(0, scores.transaction_score),
      supply_chain: Math.max(0, scores.supply_chain_score),
    },
    issues,
    total_issues: issues.length,
    scan_date: new Date().toISOString(),
  };
}

// CLI entry point
if (require.main === module) {
  const targetPath = process.argv[2] || path.join(__dirname, '..', '..', '..', 'onchainos-skills');
  console.log(`\n🔍 KYA Skill Scanner — Scanning: ${targetPath}\n`);

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Path not found: ${targetPath}`);
    process.exit(1);
  }

  const result = scanProject(targetPath);

  console.log('═══════════════════════════════════════════');
  console.log('  AGENT PROFILE');
  console.log('═══════════════════════════════════════════');
  console.log(`  Name:     ${result.agent.name}`);
  console.log(`  Version:  ${result.agent.version}`);
  console.log(`  Author:   ${result.agent.author}`);
  console.log(`  License:  ${result.agent.license}`);
  console.log(`  Skills:   ${result.agent.skills_count}`);
  console.log(`  Risk:     ${result.risk_assessment.level} (${result.risk_assessment.overall_score}/100)`);

  console.log('\n── SKILLS ──');
  for (const s of result.skills) {
    console.log(`  📦 ${s.name}`);
    console.log(`     Endpoints:    ${s.api_endpoints.length}`);
    console.log(`     Permissions:  ${s.permissions.join(', ')}`);
    console.log(`     Data Access:  ${s.data_accessed.join(', ')}`);
    console.log(`     Safety:       ${s.safety_checks.join(', ') || 'NONE'}`);
    console.log(`     Cross-deps:   ${s.cross_skill_deps.join(', ') || 'none'}`);
  }

  console.log('\n── CREDENTIAL SCAN ──');
  console.log(`  Files scanned:  ${result.credentials.summary.total_files_scanned}`);
  console.log(`  Findings:       ${result.credentials.summary.total_findings}`);
  console.log(`  Critical:       ${result.credentials.summary.by_severity?.CRITICAL || 0}`);
  console.log(`  High:           ${result.credentials.summary.by_severity?.HIGH || 0}`);

  if (result.credentials.findings.length > 0) {
    console.log('\n  Findings:');
    for (const f of result.credentials.findings) {
      console.log(`    [${f.severity}] ${f.pattern_name} at ${path.basename(f.file)}:${f.line}`);
      console.log(`           Value: ${f.matched_value} (entropy: ${f.entropy})`);
    }
  }

  console.log('\n── PROMPT INJECTION RISKS ──');
  if (result.prompt_injection_risks.length === 0) {
    console.log('  ✅ No prompt injection risks detected');
  } else {
    for (const r of result.prompt_injection_risks) {
      console.log(`  [${r.severity}] ${r.skill}: ${r.detail}`);
    }
  }

  console.log('\n── RISK ASSESSMENT ──');
  console.log(`  Overall Score:    ${result.risk_assessment.overall_score}/100 (${result.risk_assessment.level})`);
  console.log(`  Credential:       ${result.risk_assessment.scores.credential}/100`);
  console.log(`  Behavior:         ${result.risk_assessment.scores.behavior}/100`);
  console.log(`  Transaction:      ${result.risk_assessment.scores.transaction}/100`);
  console.log(`  Supply Chain:     ${result.risk_assessment.scores.supply_chain}/100`);

  if (result.risk_assessment.issues.length > 0) {
    console.log('\n  Issues:');
    for (const i of result.risk_assessment.issues) {
      console.log(`    [${i.severity}] ${i.msg}`);
    }
  }

  console.log('\n═══════════════════════════════════════════\n');
}

module.exports = { scanProject, parseSkill, assessRisk };
