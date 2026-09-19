export type {
  ProviderCapabilities,
  RecipientOutcome,
  SendOutcome,
  SendRequest,
  SmsRemainCounts,
  SmsType,
} from './types';
export { SmsProviderError, type SmsProvider } from './provider';
export {
  formatKoreanPhone,
  isValidMobilePhone,
  isValidSenderPhone,
  normalizePhone,
} from './phone';
export { byteLength, resolveMessageType, SMS_MAX_BYTES } from './message-type';
export { chunkRecipients } from './chunk';

// Provider adapters are intentionally not re-exported from this entry point. The Aligo adapter
// depends on Node's fetch and Blob, and the Solapi adapter depends on an SDK that uses fs, so
// exporting them here would pull server-only code into the browser bundle whenever a client
// component imports a general-purpose helper such as a phone number utility through this entry
// point. Server code that needs a provider imports it from a subpath instead.
//
//   import { createAligoProvider } from '@withwiz/sms-core/providers/aligo';
//   import { createSolapiProvider } from '@withwiz/sms-core/providers/solapi';
