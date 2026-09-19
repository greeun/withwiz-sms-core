import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_IMAGE_FETCH_POLICY } from '../../src/config/image-fetch';
import { createAligoProvider } from '../../src/providers/aligo';

const credentials = async () => ({ userId: 'u1', apiKey: 'k1', sender: '02-123-4567' });

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('createAligoProvider', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it('reports 1000 recipients per request and no per-recipient result through capabilities', () => {
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });
    expect(provider.name).toBe('aligo');
    expect(provider.capabilities.maxRecipientsPerRequest).toBe(1000);
    expect(provider.capabilities.perRecipientResult).toBe(false);
    expect(provider.capabilities.imageUpload).toBe('inline');
    // Phase 1 does not pass scheduledAt, so the capability is declared false as well.
    expect(provider.capabilities.scheduling).toBe(false);
  });

  it('puts the credentials and recipient fields in the SMS request as specified', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 1, message: 'success', msg_id: 77 }));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    const outcome = await provider.send({
      type: 'SMS',
      sender: '02-123-4567',
      content: 'Hello',
      recipients: ['010-1111-2222', '010-3333-4444'],
    });

    const [url, init] = fetchImpl.mock.calls[0];
    const form = init.body as FormData;
    expect(url).toBe('https://apis.aligo.in/send/');
    expect(form.get('key')).toBe('k1');
    expect(form.get('user_id')).toBe('u1');
    expect(form.get('sender')).toBe('021234567');
    expect(form.get('receiver')).toBe('01011112222,01033334444');
    expect(form.get('msg_type')).toBe('SMS');
    expect(form.get('title')).toBeNull();
    expect(outcome).toEqual({
      ok: true,
      providerMessageId: '77',
      successCount: 2,
      failCount: 0,
    });
  });

  it('puts the subject in the title field for an LMS request', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 1, message: 'success' }));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await provider.send({
      type: 'LMS',
      sender: '021234567',
      subject: 'Notice',
      content: 'Body',
      recipients: ['01011112222'],
    });

    const form = fetchImpl.mock.calls[0][1].body as FormData;
    expect(form.get('msg_type')).toBe('LMS');
    expect(form.get('title')).toBe('Notice');
  });

  it('sends the title field even when the LMS subject is empty', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 1, message: 'success' }));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await provider.send({
      type: 'LMS',
      sender: '021234567',
      content: 'Body',
      recipients: ['01011112222'],
    });

    // The original client.ts sent the field even for an empty subject, so the same behavior is kept.
    const form = fetchImpl.mock.calls[0][1].body as FormData;
    expect(form.get('title')).toBe('');
  });

  it('attaches the image as a file field for an MMS request', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 1, message: 'success' }));
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const fetchImage = vi.fn().mockResolvedValue(blob);
    const provider = createAligoProvider({
      credentials,
      fetchImage,
      fetchImpl: fetchImpl as never,
    });

    await provider.send({
      type: 'MMS',
      sender: '021234567',
      subject: 'Photo',
      content: 'Body',
      imageUrl: 'https://cdn/x.jpg',
      recipients: ['01011112222'],
    });

    expect(fetchImage).toHaveBeenCalledWith('https://cdn/x.jpg');
    const form = fetchImpl.mock.calls[0][1].body as FormData;
    expect(form.get('msg_type')).toBe('MMS');
    expect(form.get('image')).toBeInstanceOf(Blob);
  });

  it('normalizes a result_code of 0 or below into a failure result', async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse({ result_code: -201, message: 'Insufficient balance.' }),
    );
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    const outcome = await provider.send({
      type: 'SMS',
      sender: '021234567',
      content: 'Body',
      recipients: ['01011112222', '01033334444'],
    });

    expect(outcome).toEqual({
      ok: false,
      successCount: 0,
      failCount: 2,
      errorCode: '-201',
      errorMessage: 'Insufficient balance.',
    });
  });

  it('throws an SmsProviderError on an HTTP error', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({}, false, 503));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await expect(
      provider.send({ type: 'SMS', sender: '021234567', content: 'x', recipients: ['01011112222'] }),
    ).rejects.toThrow('Aligo API error: HTTP 503');
  });

  it('normalizes the remaining counts into numbers', async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse({ result_code: 1, message: 'ok', SMS_CNT: '120', LMS_CNT: 30, MMS_CNT: null }),
    );
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    expect(await provider.getRemainCounts()).toEqual({ sms: 120, lms: 30, mms: 0 });
  });

  it('throws with the response message when the remaining count query fails', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 0, message: 'Authentication failed' }));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await expect(provider.getRemainCounts()).rejects.toThrow('Authentication failed');
  });

  it('refuses a sender number that is not a phone number', async () => {
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await expect(
      provider.send({
        type: 'SMS',
        sender: 'not a number',
        content: 'x',
        recipients: ['01011112222'],
      }),
    ).rejects.toThrow(/sender/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the credential sender when the request omits one', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 1, message: 'success' }));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await provider.send({
      type: 'SMS',
      sender: '',
      content: 'x',
      recipients: ['01011112222'],
    });

    const form = fetchImpl.mock.calls[0][1].body as FormData;
    expect(form.get('sender')).toBe('021234567');
  });

  it('refuses a recipient list longer than the limit it declares, without sending anything', async () => {
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });
    const recipients = Array.from({ length: 1001 }, () => '01011112222');

    await expect(
      provider.send({ type: 'SMS', sender: '021234567', content: 'x', recipients }),
    ).rejects.toThrow(/too many recipients/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a recipient that is not a valid mobile number', async () => {
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await expect(
      provider.send({
        type: 'SMS',
        sender: '021234567',
        content: 'x',
        recipients: ['01011112222', '0212345678'],
      }),
    ).rejects.toThrow(/index 1/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an MMS image URL that points at a blocked address, without sending anything', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ result_code: 1, message: 'success' }));
    const provider = createAligoProvider({ credentials, fetchImpl: fetchImpl as never });

    await expect(
      provider.send({
        type: 'MMS',
        sender: '021234567',
        content: 'Body',
        imageUrl: 'http://169.254.169.254/latest/meta-data/',
        recipients: ['01011112222'],
      }),
    ).rejects.toThrow(/blocked network address/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lets a caller-supplied policy permit an image server inside a private network', async () => {
    const imageResponse = new Response(new Blob(['image']), {
      headers: { 'content-type': 'image/jpeg' },
    });
    fetchImpl
      .mockResolvedValueOnce(imageResponse)
      .mockResolvedValueOnce(jsonResponse({ result_code: 1, message: 'success' }));
    const provider = createAligoProvider({
      credentials,
      fetchImpl: fetchImpl as never,
      imageFetchPolicy: { ...DEFAULT_IMAGE_FETCH_POLICY, blockedSubnets: [] },
    });

    const outcome = await provider.send({
      type: 'MMS',
      sender: '021234567',
      content: 'Body',
      imageUrl: 'http://10.0.0.5/a.jpg',
      recipients: ['01011112222'],
    });

    expect(outcome.ok).toBe(true);
    const form = fetchImpl.mock.calls[1][1].body as FormData;
    expect(form.get('image')).toBeInstanceOf(Blob);
  });
});
