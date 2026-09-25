export function truncate(text: string, maxLen: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > maxLen ? `${singleLine.slice(0, maxLen - 3)}...` : singleLine;
}

export function relativeAge(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  const units: [string, number][] = [
    ["y", 31536000],
    ["mo", 2592000],
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ];
  for (const [label, secs] of units) {
    if (diffSec >= secs) return `${Math.floor(diffSec / secs)}${label} ago`;
  }
  return diffSec <= 5 ? "just now" : `${diffSec}s ago`;
}

// Heuristic redaction of secret-looking strings before anything is written to HANDOFF.md.
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[ps]_[A-Za-z0-9]{30,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{8,}["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
