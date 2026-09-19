import { SMS_MAX_BYTES } from './config/message';
import type { SmsType } from './types';

// Re-exported so that the public entry point keeps exposing it from here, unchanged by the move of
// its definition into the config module.
export { SMS_MAX_BYTES };

/**
 * Counts the byte length on an EUC-KR basis.
 * Korean and full-width characters count as 2 bytes, everything else as 1 byte.
 */
export function byteLength(text: string): number {
  let total = 0;
  for (const ch of text) {
    total += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return total;
}

/**
 * Resolves the message type from the content and the attachment state.
 * An image makes it MMS, a subject or a body over 90 bytes makes it LMS, and anything else is SMS.
 */
export function resolveMessageType(params: {
  content: string;
  subject?: string;
  imageUrl?: string;
}): SmsType {
  if (params.imageUrl) return 'MMS';
  if (params.subject) return 'LMS';
  return byteLength(params.content) > SMS_MAX_BYTES ? 'LMS' : 'SMS';
}
