/**
 * KYA Agent — Credential Detector
 * Static analysis for hardcoded credentials in source files
 */

// Regex patterns for various credential types
const CREDENTIAL_PATTERNS = [
  {
    id: 'api_key_uuid',
    name: 'API Key (UUID format)',
    regex: /['"`]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"`]/gi,
    severity: 'HIGH',
    description: 'UUID-format API key found hardcoded',
  },
  {
    id: 'hex_secret_32',
    name: 'Secret Key (32-char hex)',
    regex: /['"`]([0-9A-Fa-f]{32})['"`]/gi,
    severity: 'HIGH',
    description: '32-character hex string, likely a secret key or hash',
  },
  {
    id: 'hex_secret_64',
    name: 'Secret Key (64-char hex)',
    regex: /['"`]([0-9A-Fa-f]{64})['"`]/gi,
    severity: 'CRITICAL',
    description: '64-character hex string, likely a private key',
  },
  {
    id: 'private_key_0x',
    name: 'Private Key (0x prefix)',
    regex: /['"`](0x[0-9a-fA-F]{64})['"`]/gi,
    severity: 'CRITICAL',
    description: 'Ethereum private key with 0x prefix',
  },
  {
    id: 'mnemonic_phrase',
    name: 'Mnemonic Seed Phrase',
    regex: /['"`]((?:[a-z]+\s){11,23}[a-z]+)['"`]/gi,
    severity: 'CRITICAL',
    description: 'BIP39 mnemonic seed phrase',
  },
  {
    id: 'passphrase_pattern',
    name: 'Passphrase',
    regex: /(?:passphrase|PASSPHRASE|pass_phrase)\s*[=:]\s*['"`]([^'"`]{4,})['"`]/gi,
    severity: 'HIGH',
    description: 'Hardcoded passphrase',
  },
  {
    id: 'env_fallback',
    name: 'Environment Variable with Hardcoded Fallback',
    regex: /process\.env\.(\w+)\s*\|\|\s*['"`]([^'"`]+)['"`]/gi,
    severity: 'HIGH',
    description: 'Environment variable with hardcoded fallback value — credentials will be used even without env setup',
  },
  {
    id: 'bearer_token',
    name: 'Bearer Token',
    regex: /['"`](Bearer\s+[A-Za-z0-9\-._~+\/]+=*)['"`]/gi,
    severity: 'HIGH',
    description: 'Hardcoded Bearer token',
  },
  {
    id: 'aws_key',
    name: 'AWS Access Key',
    regex: /['"`](AKIA[0-9A-Z]{16})['"`]/gi,
    severity: 'CRITICAL',
    description: 'AWS Access Key ID',
  },
  {
    id: 'base64_key',
    name: 'Base64 Encoded Key (long)',
    regex: /['"`]([A-Za-z0-9+\/]{40,}={0,2})['"`]/gi,
    severity: 'MEDIUM',
    description: 'Long base64 string, potentially an encoded key',
  },
];

// Known safe values to exclude (common placeholders, test values, addresses)
const SAFE_PATTERNS = [
  /^0x[e]+$/i,                          // native token address 0xeeee...
  /^0x0+$/i,                            // zero address
  /^1{32}$/,                            // Solana system program
  /^placeholder/i,
  /^your[_-]?/i,
  /^example/i,
  /^test/i,
  /^TODO/i,
  /^xxx/i,
  /^0xYour/i,
];

/**
 * Calculate Shannon entropy of a string
 */
function calculateEntropy(str) {
  const freq = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const ch in freq) {
    const p = freq[ch] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Check if a value is a known safe placeholder
 */
function isSafeValue(value) {
  return SAFE_PATTERNS.some(p => p.test(value));
}

/**
 * Scan a single file's content for hardcoded credentials
 */
function scanContent(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  for (const pattern of CREDENTIAL_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(content)) !== null) {
      // Get the actual credential value
      const value = pattern.id === 'env_fallback' ? match[2] : match[1];

      // Skip safe values
      if (isSafeValue(value)) continue;

      // Skip low-entropy strings (likely not actual credentials)
      const entropy = calculateEntropy(value);
      if (entropy < 2.5 && value.length < 20) continue;

      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      // Get context (surrounding lines)
      const contextStart = Math.max(0, lineNum - 2);
      const contextEnd = Math.min(lines.length, lineNum + 2);
      const context = lines.slice(contextStart, contextEnd).join('\n');

      findings.push({
        pattern_id: pattern.id,
        pattern_name: pattern.name,
        severity: pattern.severity,
        description: pattern.description,
        file: filePath,
        line: lineNum,
        matched_value: value.length > 20 ? value.substring(0, 10) + '...' + value.substring(value.length - 5) : value,
        full_value_length: value.length,
        entropy: Math.round(entropy * 100) / 100,
        context: context,
        env_var_name: pattern.id === 'env_fallback' ? match[1] : null,
      });
    }
  }

  return findings;
}

/**
 * Scan multiple files and aggregate findings
 */
function scanFiles(filesMap) {
  const allFindings = [];
  const summary = {
    total_files_scanned: 0,
    files_with_findings: 0,
    total_findings: 0,
    by_severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    by_pattern: {},
    unique_credentials: new Set(),
  };

  for (const [filePath, content] of Object.entries(filesMap)) {
    summary.total_files_scanned++;
    const findings = scanContent(content, filePath);
    if (findings.length > 0) {
      summary.files_with_findings++;
      for (const f of findings) {
        summary.total_findings++;
        summary.by_severity[f.severity] = (summary.by_severity[f.severity] || 0) + 1;
        summary.by_pattern[f.pattern_id] = (summary.by_pattern[f.pattern_id] || 0) + 1;
        summary.unique_credentials.add(f.matched_value);
      }
      allFindings.push(...findings);
    }
  }

  summary.unique_credentials = summary.unique_credentials.size;
  return { findings: allFindings, summary };
}

module.exports = { scanContent, scanFiles, calculateEntropy, CREDENTIAL_PATTERNS };
