import { DEFAULT_IMAGE_FETCH_POLICY, type ImageFetchPolicy } from '../config/image-fetch';
import {
  SOLAPI_DEFAULT_UNIT_PRICE,
  SOLAPI_MAX_RECIPIENTS_PER_REQUEST,
  type SolapiUnitPrice,
} from '../config/solapi';
import { assertAllowedImageUrl } from '../image-fetch';
import { assertSendableRecipients, assertValidSender } from '../send-validation';
import { SmsProviderError, type SmsProvider } from '../provider';
import { normalizePhone } from '../phone';
import type {
  ProviderCapabilities,
  RecipientOutcome,
  SendOutcome,
  SendRequest,
  SmsRemainCounts,
} from '../types';

export interface SolapiCredentials {
  apiKey: string;
  apiSecret: string;
  sender: string;
}

/** The minimal surface of the Solapi SDK that is actually used. Kept narrow so a test double fits easily. */
export interface SolapiClient {
  send(messages: SolapiMessage[], config?: { scheduledDate?: string }): Promise<SolapiSendResponse>;
  getBalance(): Promise<{ balance: number; point: number }>;
  uploadFile(filePath: string, type: 'MMS' | 'KAKAO'): Promise<{ fileId: string }>;
}

export interface SolapiMessage {
  to: string;
  from: string;
  text: string;
  subject?: string;
  imageId?: string;
}

export interface SolapiSendResponse {
  groupInfo: {
    groupId: string;
    count: { total: number; registeredSuccess: number; registeredFailed: number };
  };
  failedMessageList: Array<{ to: string; statusCode?: string; statusMessage?: string }>;
}

// Re-exported so that callers keep importing the price type from the adapter subpath, unchanged by
// the move of its declaration into the config module, and so that overriding the image policy needs
// nothing beyond this same subpath.
export type { SolapiUnitPrice };
export { DEFAULT_IMAGE_FETCH_POLICY, type ImageFetchPolicy };

export interface SolapiProviderOptions {
  credentials: () => Promise<SolapiCredentials>;
  /** Injection point for replacing the SDK in tests */
  clientFactory?: (apiKey: string, apiSecret: string) => SolapiClient;
  /** Price per message used to compute the remaining counts. Falls back to the default price list. */
  unitPrice?: SolapiUnitPrice;
  /** Overrides the policy an image URL is validated against, e.g. to permit a private image server. */
  imageFetchPolicy?: ImageFetchPolicy;
}

const CAPABILITIES: ProviderCapabilities = {
  maxRecipientsPerRequest: SOLAPI_MAX_RECIPIENTS_PER_REQUEST,
  perRecipientResult: true,
  scheduling: true,
  imageUpload: 'preupload',
};

/**
 * Wraps a validation or transport failure in the port's error type. The message already states what
 * was rejected and why, so it is carried through rather than replaced, and the original error stays
 * available as the cause.
 */
function asProviderError(err: unknown): SmsProviderError {
  return new SmsProviderError(err instanceof Error ? err.message : String(err), 'solapi', err);
}

export function createSolapiProvider(options: SolapiProviderOptions): SmsProvider {
  const unitPrice = options.unitPrice ?? SOLAPI_DEFAULT_UNIT_PRICE;

  async function getClient(): Promise<{ client: SolapiClient; sender: string }> {
    const creds = await options.credentials();
    if (options.clientFactory) {
      return { client: options.clientFactory(creds.apiKey, creds.apiSecret), sender: creds.sender };
    }
    // The SDK is imported dynamically so that a project using Aligo alone is not forced to install it.
    const mod = await import('solapi').catch(() => {
      throw new SmsProviderError(
        'The solapi package is not installed. Install it with "pnpm add solapi".',
        'solapi',
      );
    });
    const ServiceCtor = (mod as { SolapiMessageService: new (k: string, s: string) => SolapiClient })
      .SolapiMessageService;
    return { client: new ServiceCtor(creds.apiKey, creds.apiSecret), sender: creds.sender };
  }

  return {
    name: 'solapi',
    capabilities: CAPABILITIES,

    async send(request: SendRequest): Promise<SendOutcome> {
      // Checked before the client is even constructed: a request the provider would reject, or one
      // that silently exceeds the declared limit, should not reach the network at all.
      try {
        assertSendableRecipients(request.recipients, SOLAPI_MAX_RECIPIENTS_PER_REQUEST);
      } catch (err) {
        throw asProviderError(err);
      }

      const { client, sender: defaultSender } = await getClient();
      // The sender can only be checked once the credentials have supplied the fallback.
      const from = normalizePhone(request.sender || defaultSender);
      try {
        assertValidSender(from);
      } catch (err) {
        throw asProviderError(err);
      }

      let imageId: string | undefined;
      if (request.type === 'MMS' && request.imageUrl) {
        // uploadFile takes a file path in the SDK signature, so an unvalidated value could reach
        // the file system instead of the network. Requiring an absolute URL under the policy rules
        // that out before the SDK ever sees the string.
        try {
          assertAllowedImageUrl(request.imageUrl, options.imageFetchPolicy);
        } catch (err) {
          throw asProviderError(err);
        }

        try {
          // The first argument of uploadFile is a file path according to its signature. The official
          // documentation passes a URL for KakaoTalk friend messages, but its MMS example uses a local
          // path, so whether a public URL is accepted as is must be confirmed with a real account.
          const uploaded = await client.uploadFile(request.imageUrl, 'MMS');
          imageId = uploaded.fileId;
        } catch (err) {
          throw new SmsProviderError(
            `Failed to upload MMS image: ${err instanceof Error ? err.message : String(err)}`,
            'solapi',
            err,
          );
        }
      }

      const messages: SolapiMessage[] = request.recipients.map((phone) => ({
        to: normalizePhone(phone),
        from,
        text: request.content,
        ...(request.type !== 'SMS' && request.subject ? { subject: request.subject } : {}),
        ...(imageId ? { imageId } : {}),
      }));

      let response: SolapiSendResponse;
      try {
        // When there is no scheduled time, the second argument is omitted entirely. Passing an
        // explicit `undefined` would make the call carry two arguments, which contradicts the test
        // that expects the array alone.
        response = request.scheduledAt
          ? await client.send(messages, { scheduledDate: toSolapiDate(request.scheduledAt) })
          : await client.send(messages);
      } catch (err) {
        // When every message fails to be accepted, the Solapi SDK throws MessageNotReceivedError
        // instead of returning a normal response. A send failure must be normalized into a
        // SendOutcome per the port contract, so it is converted here.
        const notReceived = asMessageNotReceived(err);
        if (notReceived) {
          const failures = notReceived.failedMessageList;
          const first = failures[0];
          return {
            ok: false,
            successCount: 0,
            failCount: messages.length,
            errorCode: first?.statusCode ?? '',
            errorMessage: first?.statusMessage ?? 'Failed to send the message.',
            // Everything failed, so no recipient is marked as successful even if the failure list
            // happens to omit one.
            perRecipient: mapPerRecipient(messages, failures).map((r) => ({ ...r, ok: false })),
          };
        }
        // Authentication failures, network errors, malformed requests and the like are treated as
        // communication failures and rethrown wrapped.
        throw new SmsProviderError(
          err instanceof Error ? err.message : String(err),
          'solapi',
          err,
        );
      }

      const perRecipient = mapPerRecipient(messages, response.failedMessageList);
      const successCount = response.groupInfo.count.registeredSuccess;
      const failCount = response.groupInfo.count.registeredFailed;
      const firstFailure = response.failedMessageList[0];

      // A total failure is handled in the catch above, but the branch below is kept in case the SDK
      // reports it through a normal response instead of an exception.
      return {
        ok: successCount > 0,
        providerMessageId: response.groupInfo.groupId,
        successCount,
        failCount,
        ...(successCount === 0 && firstFailure
          ? {
              errorCode: firstFailure.statusCode ?? '',
              errorMessage: firstFailure.statusMessage ?? 'Failed to send the message.',
            }
          : {}),
        perRecipient,
      };
    },

    async getRemainCounts(): Promise<SmsRemainCounts> {
      const { client } = await getClient();
      let balance: number;
      try {
        ({ balance } = await client.getBalance());
      } catch (err) {
        throw new SmsProviderError(
          `Failed to fetch remaining counts: ${err instanceof Error ? err.message : String(err)}`,
          'solapi',
          err,
        );
      }
      return {
        sms: Math.floor(balance / unitPrice.sms),
        lms: Math.floor(balance / unitPrice.lms),
        mms: Math.floor(balance / unitPrice.mms),
      };
    },
  };
}

/**
 * The minimal shape of the error the Solapi SDK throws when every message fails.
 *
 * Internally the SDK uses effect-style tagged errors (`_tag`), but the public `send()` does not
 * throw them as is. Looking at `dist/index.js` of solapi 5.5.4, the conversion function builds a
 * `new Error(message)`, sets `name` to `'MessageNotReceivedError'` and copies over only
 * `failedMessageList` and `totalCount`. `_tag` is not carried over, so the check must rely on `name`.
 */
interface SolapiMessageNotReceivedError extends Error {
  failedMessageList: ReadonlyArray<{ to: string; statusCode?: string; statusMessage?: string }>;
  totalCount: number;
}

function asMessageNotReceived(err: unknown): SolapiMessageNotReceivedError | null {
  if (!(err instanceof Error)) return null;
  const candidate = err as { _tag?: unknown; failedMessageList?: unknown };
  // The current version keeps `name` alone, but the SDK could start propagating its internal tag,
  // so both shapes are accepted. The presence of an actual failure list is checked as well.
  const matches =
    err.name === 'MessageNotReceivedError' || candidate._tag === 'MessageNotReceivedError';
  return matches && Array.isArray(candidate.failedMessageList)
    ? (err as SolapiMessageNotReceivedError)
    : null;
}

/** Matches the failure list against the recipient numbers to build per-recipient results. */
function mapPerRecipient(
  messages: SolapiMessage[],
  failedList: ReadonlyArray<{ to: string; statusCode?: string; statusMessage?: string }>,
): RecipientOutcome[] {
  const failedByPhone = new Map(failedList.map((f) => [normalizePhone(f.to), f]));
  return messages.map((m) => {
    const failed = failedByPhone.get(m.to);
    return failed
      ? {
          phone: m.to,
          ok: false,
          ...(failed.statusCode ? { code: failed.statusCode } : {}),
          ...(failed.statusMessage ? { message: failed.statusMessage } : {}),
        }
      : { phone: m.to, ok: true };
  });
}

/** Solapi's scheduled sending expects the `YYYY-MM-DD HH:mm:ss` format. */
function toSolapiDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
