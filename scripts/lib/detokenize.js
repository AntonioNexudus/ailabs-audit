const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// De-tokenization for the .html report (operator-only deliverable).
//
// We rely entirely on the CLI's automatic tokenization and never generate
// tokens ourselves. In a normal (locked) run the CLI returns `«PII:…»` tokens
// and keeps the token-to-value map in its own local store (~/.nexudus/
// pii-tokens.json). The .md keeps the tokens (AI-safe); the .html, which only
// the operator sees, reverses them using that same store. Tokens without a
// mapping are left as-is.
// ---------------------------------------------------------------------------

const PII_TOKEN_RE = /«PII:[A-Z_]+:[0-9a-fA-F]+»/g;

// Loads the CLI's local token-to-value map. Returns a Map (possibly empty).
// Never throws: a missing or unreadable file just means no de-tokenization.
function loadCliTokenMap() {
  const map = new Map();
  try {
    const file = path.join(require('os').homedir(), '.nexudus', 'pii-tokens.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tokens = parsed.Tokens || parsed.tokens || {};
    for (const [tok, val] of Object.entries(tokens)) map.set(tok, val);
  } catch { /* no map available — html will keep tokens */ }
  return map;
}

// Deep-clones `results`, replacing every `«PII:…»` token in any string value
// with its real value from the CLI token map. Embedded tokens (e.g. inside a
// concatenated field) are handled too. Returns the original object unchanged if
// the map is empty (nothing to reverse).
function detokenizeResults(results, tokenMap) {
  if (!tokenMap || tokenMap.size === 0) return results;
  const walk = (v) => {
    if (typeof v === 'string') {
      return v.includes('«PII:')
        ? v.replace(PII_TOKEN_RE, (m) => (tokenMap.has(m) ? tokenMap.get(m) : m))
        : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(results);
}

module.exports = { loadCliTokenMap, detokenizeResults };
