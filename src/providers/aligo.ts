import {
  ALIGO_MAX_RECIPIENTS_PER_REQUEST,
  ALIGO_MMS_FILE_NAME,
  ALIGO_REMAIN_URL,
  ALIGO_SEND_URL,
} from '../config/aligo';
import { DEFAULT_IMAGE_FETCH_POLICY, type ImageFetchPolicy } from '../config/image-fetch';
import { fetchImage as fetchImageFromUrl } from '../image-fetch';
import { SmsProviderError, type SmsProvider } from '../provider';
import { normalizePhone } from '../phone';
import { assertSendableRecipients, assertValidSender } from '../send-validation';
import type { ProviderCapabilities, SendOutcome, SendRequest, SmsRemainCounts } from '../types';

// Re-exported so that overriding the image policy needs nothing beyond the adapter's own subpath.
export { DEFAULT_IMAGE_FETCH_POLICY, type ImageFetchPolicy };

export interface AligoCredentials {
  userId: string;
  apiKey: string;
  sender: string;
}

export interface AligoProviderOptions {
  credentials: () => Promise<AligoCredentials>;
  /**
   * How to obtain the MMS image. Fetched under the image policy when not specified. Supplying this
   * replaces the built-in fetch entirely, including its safety checks, so an implementation that
   * accepts a caller-supplied URL has to validate that URL itself.
   */
  fetchImage?: (url: string) => Promise<Blob>;
  /** Overrides the policy the built-in image fetch applies, e.g. to permit a private image server. */
  imageFetchPolicy?: ImageFetchPolicy;
  /** Injection point for replacing fetch in tests */
  fetchImpl?: typeof fetch;
}

const CAPABILITIES: ProviderCapabilities = {
  maxRecipientsPerRequest: ALIGO_MAX_RECIPIENTS_PER_REQUEST,
  perRecipientResult: false,
  // The Aligo API itself supports scheduled sending through the rdate/rtime parameters, but this
  // adapter does not pass scheduledAt yet. A capability declaration must reflect only what actually
  // works, so this becomes true once the forwarding logic lands in phase 2.
  scheduling: false,
  imageUpload: 'inline',
};

/** Raw JSON response of Aligo's /send/ endpoint */
interface AligoSendResponse {
  result_code: number | string;
  message: string;
  msg_id?: number | string;
}

/** Raw JSON response of Aligo's /remain/ endpoint */
interface AligoRemainResponse {
  result_code: number | string;
  message: string;
  SMS_CNT?: number | string | null;
  LMS_CNT?: number | string | null;
  MMS_CNT?: number | string | null;
}

/**
 * Wraps a validation or transport failure in the port's error type. The message already states what
 * was rejected and why, so it is carried through rather than replaced, and the original error stays
 * available as the cause.
 */
function asProviderError(err: unknown): SmsProviderError {
  return new SmsProviderError(err instanceof Error ? err.message : String(err), 'aligo', err);
}

export function createAligoProvider(options: AligoProviderOptions): SmsProvider {
  const doFetch = options.fetchImpl ?? fetch;

  async function loadImage(url: string): Promise<Blob> {
    if (options.fetchImage) return options.fetchImage(url);
    try {
      return await fetchImageFromUrl(url, doFetch, options.imageFetchPolicy);
    } catch (err) {
      throw asProviderError(err);
    }
  }

  return {
    name: 'aligo',
    capabilities: CAPABILITIES,

    async send(request: SendRequest): Promise<SendOutcome> {
      // Checked before the credentials are even loaded: a request the provider would reject, or one
      // that silently exceeds the declared limit, should not reach the network at all.
      try {
        assertSendableRecipients(request.recipients, ALIGO_MAX_RECIPIENTS_PER_REQUEST);
      } catch (err) {
        throw asProviderError(err);
      }

      const creds = await options.credentials();
      // The sender can only be checked once the credentials have supplied the fallback.
      const sender = normalizePhone(request.sender || creds.sender);
      try {
        assertValidSender(sender);
      } catch (err) {
        throw asProviderError(err);
      }

      const form = new FormData();
      form.append('key', creds.apiKey);
      form.append('user_id', creds.userId);
      form.append('sender', sender);
      // Aligo's receiver specification: comma separated, up to 1,000 recipients
      form.append('receiver', request.recipients.map(normalizePhone).join(','));
      form.append('msg', request.content);
      form.append('msg_type', request.type);

      // Subject for LMS/MMS (up to 44 bytes). The original client.ts sent the field even when the
      // subject was empty, so the same behavior is kept in case Aligo requires the field itself.
      if (request.type !== 'SMS') {
        form.append('title', request.subject ?? '');
      }

      // Aligo's MMS requires an actual file upload rather than an image URL.
      if (request.type === 'MMS' && request.imageUrl) {
        form.append('image', await loadImage(request.imageUrl), ALIGO_MMS_FILE_NAME);
      }

      const res = await doFetch(ALIGO_SEND_URL, { method: 'POST', body: form });
      if (!res.ok) {
        throw new SmsProviderError(`Aligo API error: HTTP ${res.status}`, 'aligo');
      }

      const json = (await res.json()) as AligoSendResponse;
      const code = Number(json.result_code);
      const total = request.recipients.length;

      // A result_code above 0 means success; anything else (0 or negative) is a failure, and the
      // reason is carried in the message field.
      if (code > 0) {
        return {
          ok: true,
          ...(json.msg_id != null ? { providerMessageId: String(json.msg_id) } : {}),
          successCount: total,
          failCount: 0,
        };
      }

      return {
        ok: false,
        successCount: 0,
        failCount: total,
        errorCode: String(json.result_code ?? ''),
        errorMessage: json.message,
      };
    },

    async getRemainCounts(): Promise<SmsRemainCounts> {
      const creds = await options.credentials();
      const form = new FormData();
      form.append('key', creds.apiKey);
      form.append('user_id', creds.userId);

      const res = await doFetch(ALIGO_REMAIN_URL, { method: 'POST', body: form });
      if (!res.ok) {
        throw new SmsProviderError(`Aligo API error: HTTP ${res.status}`, 'aligo');
      }

      const json = (await res.json()) as AligoRemainResponse;
      if (Number(json.result_code) <= 0) {
        throw new SmsProviderError(json.message || 'Failed to fetch remaining counts.', 'aligo');
      }

      return {
        sms: Number(json.SMS_CNT) || 0,
        lms: Number(json.LMS_CNT) || 0,
        mms: Number(json.MMS_CNT) || 0,
      };
    },
  };
}
