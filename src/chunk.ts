/**
 * Splits a recipient list to fit the provider's per-request maximum.
 * Used by the split sending introduced in phase 2.
 */
export function chunkRecipients(recipients: string[], size: number): string[][] {
  if (size < 1) {
    throw new Error('Chunk size must be at least 1.');
  }
  const result: string[][] = [];
  for (let i = 0; i < recipients.length; i += size) {
    result.push(recipients.slice(i, i + size));
  }
  return result;
}
