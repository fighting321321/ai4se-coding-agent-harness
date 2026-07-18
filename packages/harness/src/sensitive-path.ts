const SENSITIVE_NAMES = new Set([
  ".env",
  ".git-credentials",
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".secrets",
  ".ssh",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "private-key",
  "private-key.pem",
  "private.key",
  "private.pem",
  "private_key",
  "service-account.json"
]);

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/u).filter((segment) => segment.length > 0);
}

export function isSensitivePath(path: string): boolean {
  return pathSegments(path).some((segment) => {
    const normalized = segment.toLowerCase();
    return (
      SENSITIVE_NAMES.has(normalized) ||
      normalized.startsWith(".env.") ||
      normalized.endsWith(".key")
    );
  });
}
