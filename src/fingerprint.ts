export function shortenFingerprint(hex?: string | null, chars = 4): string {
  if (!hex) return "unknown";
  const clean = hex.trim();
  if (clean.length <= chars * 2 + 2) return clean;
  const start = clean.startsWith("0x") ? clean.slice(0, chars + 2) : clean.slice(0, chars);
  const end = clean.slice(-chars);
  return `${start}...${end}`;
}

export function formatNullifier(nullifier?: string | null): string {
  return shortenFingerprint(nullifier, 6);
}
