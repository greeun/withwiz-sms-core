import type { ProviderCapabilities, SendOutcome, SendRequest, SmsRemainCounts } from './types';

/**
 * The port that a messaging vendor adapter implements.
 * Vendor-specific request formats and response codes are handled inside the adapter only,
 * and the upper layers receive nothing but a SendOutcome.
 */
export interface SmsProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  send(request: SendRequest): Promise<SendOutcome>;
  getRemainCounts(): Promise<SmsRemainCounts>;
}

/** Thrown when the adapter fails at the communication level. Distinct from a failed send response. */
export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SmsProviderError';
  }
}
