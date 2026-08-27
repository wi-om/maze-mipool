/** Extract unique txid tokens from pasted text or file content (newline/comma/whitespace separated). */
export function parseTxidsFromText(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of text.split(/[\s,;]+/)) {
    const trimmed = token.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}
