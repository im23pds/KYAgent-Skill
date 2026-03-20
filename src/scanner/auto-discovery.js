/**
 * KYA Agent — Auto-Discovery
 * Automatically discovers installed AI Agent/Skill packages on the system.
 * Scans common installation paths and identifies packages with skills/ directories,
 * SKILL.md files, .claude-plugin/, .cursor-plugin/, or AGENTS.md markers.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Discover all installed Agent/Skill packages
 * @param {object} opts - Options
 * @param {string[]} opts.extraPaths - Additional paths to scan
 * @returns {object[]} Array of discovered agent/skill packages
 */
function discoverSkills(opts = {}) {
  const discovered = [];
  const seen = new Set();
  const kyaRoot = path.resolve(__dirname, '..', '..');

  // 1. Sibling directories (most common for local dev)
  const parentDir = path.dirname(kyaRoot);
  scanDirectory(parentDir, discovered, seen, 1);

  // 2. Current working directory children
  const cwd = process.cwd();
  if (cwd !== parentDir) {
    scanDirectory(cwd, discovered, seen, 1);
  }

  // 3. Home directory common locations
  const home = os.homedir();
  const homePaths = [
    path.join(home, '.claude', 'plugins'),
    path.join(home, '.cursor', 'plugins'),
    path.join(home, '.config', 'claude-code', 'plugins'),
    path.join(home, '.local', 'share', 'claude-code', 'plugins'),
  ];
  for (const hp of homePaths) {
    if (fs.existsSync(hp)) {
      scanDirectory(hp, discovered, seen, 1);
    }
  }

  // 4. Extra paths from opts or environment
  const envPaths = process.env.KYA_SCAN_PATHS;
  const extraPaths = [
    ...(opts.extraPaths || []),
    ...(envPaths ? envPaths.split(':') : []),
  ];
  for (const ep of extraPaths) {
    const resolved = path.resolve(ep);
    if (fs.existsSync(resolved)) {
      // Check if it IS a skill package
      if (isSkillPackage(resolved)) {
        addDiscovered(resolved, discovered, seen);
      } else {
        scanDirectory(resolved, discovered, seen, 1);
      }
    }
  }

  // 5. ONCHAINOS_PATH (legacy support)
  const onchainPath = process.env.ONCHAINOS_PATH;
  if (onchainPath && fs.existsSync(onchainPath)) {
    addDiscovered(path.resolve(onchainPath), discovered, seen);
  }

  // Filter out kya-agent itself
  return discovered.filter(d => path.resolve(d.path) !== kyaRoot);
}

/**
 * Scan a directory for skill packages (1-level deep)
 */
function scanDirectory(dir, discovered, seen, maxDepth) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);
      if (isSkillPackage(fullPath)) {
        addDiscovered(fullPath, discovered, seen);
      } else if (maxDepth > 0) {
        // Check one more level (for structures like plugins/vendor/package)
        scanDirectory(fullPath, discovered, seen, maxDepth - 1);
      }
    }
  } catch (e) { /* Permission denied or other FS error — skip */ }
}

/**
 * Check if a directory is a skill/agent package
 */
function isSkillPackage(dir) {
  const markers = [
    // Has a skills/ directory with SKILL.md inside
    () => {
      const skillsDir = path.join(dir, 'skills');
      if (!fs.existsSync(skillsDir)) return false;
      try {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        return entries.some(e => {
          if (!e.isDirectory()) return false;
          return fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'));
        });
      } catch { return false; }
    },
    // Has .claude-plugin/ or .cursor-plugin/
    () => fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json')),
    () => fs.existsSync(path.join(dir, '.cursor-plugin', 'plugin.json')),
    // Has AGENTS.md
    () => fs.existsSync(path.join(dir, 'AGENTS.md')),
    // Has package.json with "skills" keyword
    () => {
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) return false;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return (pkg.keywords || []).some(k =>
          ['skills', 'claude-code', 'cursor', 'agent', 'onchainos'].includes(k)
        );
      } catch { return false; }
    },
  ];

  return markers.some(check => {
    try { return check(); } catch { return false; }
  });
}

/**
 * Add a discovered package (deduplication by resolved path)
 */
function addDiscovered(fullPath, discovered, seen) {
  const resolved = path.resolve(fullPath);
  if (seen.has(resolved)) return;
  seen.add(resolved);

  const info = { path: resolved, name: path.basename(resolved) };

  // Try to read package.json for metadata
  const pkgPath = path.join(resolved, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      info.name = pkg.name || info.name;
      info.version = pkg.version || 'unknown';
      info.description = pkg.description || '';
      info.author = typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name || 'unknown');
      info.license = pkg.license || 'unknown';
      info.homepage = pkg.homepage || '';
    } catch { /* skip */ }
  }

  // Count skills
  const skillsDir = path.join(resolved, 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      info.skills_count = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md')))
        .length;
    } catch { info.skills_count = 0; }
  } else {
    info.skills_count = 0;
  }

  // Detect plugin type
  info.plugins = [];
  if (fs.existsSync(path.join(resolved, '.claude-plugin'))) info.plugins.push('claude');
  if (fs.existsSync(path.join(resolved, '.cursor-plugin'))) info.plugins.push('cursor');
  if (fs.existsSync(path.join(resolved, '.codex'))) info.plugins.push('codex');
  if (fs.existsSync(path.join(resolved, '.opencode'))) info.plugins.push('opencode');

  discovered.push(info);
}

module.exports = { discoverSkills, isSkillPackage };
