# @withwiz/sms-core

English | [한국어](./README.ko.md)

SMS/LMS/MMS sending core. Provides a provider-neutral interface with Aligo and Solapi adapters.

## Install

```bash
pnpm add @withwiz/sms-core
# only when using Solapi
pnpm add solapi
```

## Usage

Provider adapters are imported from a subpath, not from the root entry point. The Aligo adapter
depends on Node's `fetch` and `Blob`, and the Solapi adapter depends on an SDK that uses `fs`. If
they were exported from the root as well, server-only code would end up in the browser bundle even
when a client component imports nothing but a general-purpose helper such as a phone number utility.

```typescript
import { createAligoProvider } from '@withwiz/sms-core/providers/aligo';

const provider = createAligoProvider({
  credentials: async () => ({ userId, apiKey, sender }),
});

const outcome = await provider.send({
  type: 'SMS',
  sender,
  content: 'This is a notification message.',
  recipients: ['01012345678', '01087654321'],
});

if (!outcome.ok) {
  console.error(outcome.errorCode, outcome.errorMessage);
}
```

The message type (`type`) is decided by the caller. When the user picks SMS/LMS/MMS directly, as
with the tabs of a send form, no separate type resolution logic is needed.

## Helpers

- `byteLength`: counts the byte length on an EUC-KR basis. The send form in `@withwiz/sms-admin`
  uses it to display the byte count of the body and subject as they are being typed.
- `resolveMessageType`: a helper for deciding the message type automatically from the content and
  the attachment state. Like `chunkRecipients`, it currently has no consumer.

## Request validation

`send` checks the recipient list before it loads credentials or touches the network. An empty list,
a number that is not a valid mobile number, and a list longer than the provider accepts are all
rejected with an `SmsProviderError`. Until this check existed, `capabilities.maxRecipientsPerRequest`
announced a limit that nothing enforced, and `isValidMobilePhone` described itself as the source of
truth for recipient validation while no send path called it.

An invalid entry rejects the whole request rather than being filtered out, because a caller that is
not told about the omission would believe every recipient was reached. To drop bad entries instead,
filter with `isValidMobilePhone` before calling `send`; to send to more recipients than one request
allows, split the list with `chunkRecipients`.

The error names the positions of the offending entries rather than the numbers themselves, since an
error message travels into logs and a phone number is personal data.

The sender is checked as well, once the credentials have supplied the fallback for a request that
omits one. A sender follows wider rules than a recipient, since it is often a landline or a
representative number rather than a mobile number, so it has its own check: a number starting with
`0` that is 9 to 11 digits long, or an 8-digit representative number in the 15xx, 16xx and 18xx
ranges. `isValidSenderPhone` is exported for use in a form. Only the shape is checked — providers
send only from numbers registered to the account in advance, and nothing local can confirm that, so
a number accepted here may still be rejected by the provider.

## MMS image safety

An MMS `imageUrl` is supplied by the caller, and the server is what fetches it. Both adapters
therefore validate the URL before anything acts on it: only `http:` and `https:` are accepted, and
loopback, private, link-local and other reserved ranges are refused, which covers the cloud metadata
endpoint at `169.254.169.254`. The Aligo adapter, which fetches the image itself, additionally
refuses to follow redirects, applies a timeout, and abandons a body that outgrows the size limit
while it is still arriving. The Solapi adapter validates the URL before handing it to the SDK, whose
`uploadFile` would otherwise accept a local file path.

Name resolution happens after validation, so a host name that resolves to a blocked address is not
caught. Restrict outbound traffic at the network level when that matters.

The rules live in `src/config/image-fetch.ts` as defaults. A deployment whose image server sits
inside a private network overrides them per provider:

```typescript
import {
  createAligoProvider,
  DEFAULT_IMAGE_FETCH_POLICY,
} from '@withwiz/sms-core/providers/aligo';

const provider = createAligoProvider({
  credentials: async () => ({ userId, apiKey, sender }),
  imageFetchPolicy: { ...DEFAULT_IMAGE_FETCH_POLICY, blockedSubnets: [] },
});
```

Supplying `fetchImage` replaces the built-in fetch entirely, including these checks, so such an
implementation has to validate a caller-supplied URL itself.

## Provider capability comparison

| Item | Aligo | Solapi |
|------|-------|--------|
| Recipients per request | 1,000 | 10,000 |
| Per-recipient result | Not provided | Provided |
| MMS image | Attached with each request | Uploaded in advance |

## License

MIT
