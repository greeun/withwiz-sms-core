/** Message type. Determined by the length and whether an image is attached. */
export type SmsType = 'SMS' | 'LMS' | 'MMS';

/** The range of features a provider supports. Upper layers consult it to adjust their behavior. */
export interface ProviderCapabilities {
  /** Maximum number of recipients that a single request can carry */
  maxRecipientsPerRequest: number;
  /** Whether per-recipient success/failure results are provided */
  perRecipientResult: boolean;
  /** Whether scheduled sending is supported */
  scheduling: boolean;
  /** How MMS images are delivered. 'inline' attaches the file to each request, 'preupload' uploads it in advance and refers to it by identifier */
  imageUpload: 'inline' | 'preupload';
}

export interface SendRequest {
  type: SmsType;
  /** Sender number. The adapter strips hyphens, so they may be included. */
  sender: string;
  /** Subject for LMS/MMS */
  subject?: string;
  content: string;
  /** Public URL of the MMS image */
  imageUrl?: string;
  /** List of recipient numbers */
  recipients: string[];
  /** Scheduled send time. Used in phase 2. */
  scheduledAt?: Date;
}

/** Send result for a single recipient. Populated only when the provider reports individual results. */
export interface RecipientOutcome {
  phone: string;
  ok: boolean;
  code?: string;
  message?: string;
}

/** Provider-neutral send result. */
export interface SendOutcome {
  ok: boolean;
  /** Send identifier assigned by the provider */
  providerMessageId?: string;
  successCount: number;
  failCount: number;
  errorCode?: string;
  errorMessage?: string;
  perRecipient?: RecipientOutcome[];
}

/** Remaining sendable message counts: how many messages the current balance still covers. */
export interface SmsRemainCounts {
  sms: number;
  lms: number;
  mms: number;
}
