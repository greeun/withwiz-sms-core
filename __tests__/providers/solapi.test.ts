import { describe, expect, it, vi } from 'vitest';
import { createSolapiProvider } from '../../src/providers/solapi';

const credentials = async () => ({ apiKey: 'k', apiSecret: 's', sender: '02-123-4567' });

describe('createSolapiProvider', () => {
  it('refuses a sender number that is not a phone number', async () => {
    const send = vi.fn();
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    await expect(
      provider.send({
        type: 'SMS',
        sender: 'not a number',
        content: 'x',
        recipients: ['01011112222'],
      }),
    ).rejects.toThrow(/sender/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a recipient list longer than the limit it declares, without sending anything', async () => {
    const send = vi.fn();
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });
    const recipients = Array.from({ length: 10001 }, () => '01011112222');

    await expect(
      provider.send({ type: 'SMS', sender: '021234567', content: 'x', recipients }),
    ).rejects.toThrow(/too many recipients/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a recipient that is not a valid mobile number', async () => {
    const send = vi.fn();
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    await expect(
      provider.send({
        type: 'SMS',
        sender: '021234567',
        content: 'x',
        recipients: ['01011112222', '0212345678'],
      }),
    ).rejects.toThrow(/index 1/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an MMS image URL that points at a blocked address, without uploading anything', async () => {
    const uploadFile = vi.fn();
    const send = vi.fn();
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile }),
    });

    await expect(
      provider.send({
        type: 'MMS',
        sender: '021234567',
        content: 'Body',
        imageUrl: 'http://169.254.169.254/latest/meta-data/',
        recipients: ['01011112222'],
      }),
    ).rejects.toThrow(/blocked network address/i);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an image reference that is a local path rather than a URL', async () => {
    const uploadFile = vi.fn();
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send: vi.fn(), getBalance: vi.fn(), uploadFile }),
    });

    // uploadFile takes a file path in the SDK signature, so an unvalidated value would let a
    // caller-supplied string reach the file system.
    await expect(
      provider.send({
        type: 'MMS',
        sender: '021234567',
        content: 'Body',
        imageUrl: '/etc/passwd',
        recipients: ['01011112222'],
      }),
    ).rejects.toThrow(/valid absolute URL/i);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('reports 10000 recipients per request and per-recipient results through capabilities', () => {
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send: vi.fn(), getBalance: vi.fn(), uploadFile: vi.fn() }),
    });
    expect(provider.name).toBe('solapi');
    expect(provider.capabilities.maxRecipientsPerRequest).toBe(10000);
    expect(provider.capabilities.perRecipientResult).toBe(true);
    expect(provider.capabilities.imageUpload).toBe('preupload');
  });

  it('builds one message object per recipient', async () => {
    const send = vi.fn().mockResolvedValue({
      groupInfo: { groupId: 'G1', count: { total: 2, registeredSuccess: 2, registeredFailed: 0 } },
      failedMessageList: [],
    });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    const outcome = await provider.send({
      type: 'SMS',
      sender: '02-123-4567',
      content: 'Hi',
      recipients: ['010-1111-2222', '010-3333-4444'],
    });

    expect(send).toHaveBeenCalledWith([
      { to: '01011112222', from: '021234567', text: 'Hi' },
      { to: '01033334444', from: '021234567', text: 'Hi' },
    ]);
    expect(outcome.ok).toBe(true);
    expect(outcome.successCount).toBe(2);
    expect(outcome.failCount).toBe(0);
    expect(outcome.providerMessageId).toBe('G1');
    expect(outcome.perRecipient).toEqual([
      { phone: '01011112222', ok: true },
      { phone: '01033334444', ok: true },
    ]);
  });

  it('puts the subject of an LMS in the subject field', async () => {
    const send = vi.fn().mockResolvedValue({
      groupInfo: { groupId: 'G2', count: { total: 1, registeredSuccess: 1, registeredFailed: 0 } },
      failedMessageList: [],
    });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    await provider.send({
      type: 'LMS',
      sender: '021234567',
      subject: 'Notice',
      content: 'Body',
      recipients: ['01011112222'],
    });

    expect(send).toHaveBeenCalledWith([
      { to: '01011112222', from: '021234567', text: 'Body', subject: 'Notice' },
    ]);
  });

  it('uploads the MMS image first and refers to it by imageId', async () => {
    const send = vi.fn().mockResolvedValue({
      groupInfo: { groupId: 'G3', count: { total: 1, registeredSuccess: 1, registeredFailed: 0 } },
      failedMessageList: [],
    });
    const uploadFile = vi.fn().mockResolvedValue({ fileId: 'F1' });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile }),
    });

    await provider.send({
      type: 'MMS',
      sender: '021234567',
      subject: 'Photo',
      content: 'Body',
      imageUrl: 'https://cdn/x.jpg',
      recipients: ['01011112222'],
    });

    expect(uploadFile).toHaveBeenCalledWith('https://cdn/x.jpg', 'MMS');
    expect(send).toHaveBeenCalledWith([
      { to: '01011112222', from: '021234567', text: 'Body', subject: 'Photo', imageId: 'F1' },
    ]);
  });

  it('marks a failed recipient in perRecipient', async () => {
    const send = vi.fn().mockResolvedValue({
      groupInfo: { groupId: 'G4', count: { total: 2, registeredSuccess: 1, registeredFailed: 1 } },
      failedMessageList: [
        { to: '01033334444', statusCode: '3019', statusMessage: 'Opted out' },
      ],
    });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    const outcome = await provider.send({
      type: 'SMS',
      sender: '021234567',
      content: 'Body',
      recipients: ['01011112222', '01033334444'],
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.successCount).toBe(1);
    expect(outcome.failCount).toBe(1);
    expect(outcome.perRecipient).toEqual([
      { phone: '01011112222', ok: true },
      { phone: '01033334444', ok: false, code: '3019', message: 'Opted out' },
    ]);
  });

  it('normalizes a MessageNotReceivedError thrown on a total failure into a SendOutcome', async () => {
    // When every message fails to be accepted, the Solapi SDK throws instead of returning a normal
    // response. The shape the SDK actually builds is reproduced here: only name is set, and _tag is
    // absent.
    const notReceived = Object.assign(new Error('Message not accepted'), {
      name: 'MessageNotReceivedError',
      failedMessageList: [
        { to: '01011112222', statusCode: '2000', statusMessage: 'Insufficient balance' },
        { to: '01033334444', statusCode: '2000', statusMessage: 'Insufficient balance' },
      ],
      totalCount: 2,
    });
    const send = vi.fn().mockRejectedValue(notReceived);
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    const outcome = await provider.send({
      type: 'SMS',
      sender: '021234567',
      content: 'Body',
      recipients: ['01011112222', '01033334444'],
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.successCount).toBe(0);
    expect(outcome.failCount).toBe(2);
    expect(outcome.errorCode).toBe('2000');
    expect(outcome.errorMessage).toBe('Insufficient balance');
    expect(outcome.perRecipient).toEqual([
      { phone: '01011112222', ok: false, code: '2000', message: 'Insufficient balance' },
      { phone: '01033334444', ok: false, code: '2000', message: 'Insufficient balance' },
    ]);
  });

  it('wraps any other SDK error in an SmsProviderError', async () => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('Invalid API Key Error'), { name: 'ApiKeyError' }),
    );
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    await expect(
      provider.send({ type: 'SMS', sender: '021234567', content: 'x', recipients: ['01011112222'] }),
    ).rejects.toThrow('Invalid API Key Error');
  });

  it('passes scheduledDate along when a scheduled time is given', async () => {
    const send = vi.fn().mockResolvedValue({
      groupInfo: { groupId: 'G6', count: { total: 1, registeredSuccess: 1, registeredFailed: 0 } },
      failedMessageList: [],
    });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send, getBalance: vi.fn(), uploadFile: vi.fn() }),
    });

    await provider.send({
      type: 'SMS',
      sender: '021234567',
      content: 'Body',
      recipients: ['01011112222'],
      scheduledAt: new Date(2026, 8, 19, 9, 5, 3),
    });

    expect(send).toHaveBeenCalledWith(
      [{ to: '01011112222', from: '021234567', text: 'Body' }],
      { scheduledDate: '2026-09-19 09:05:03' },
    );
  });

  it('computes the remaining counts with the default price when none is given', async () => {
    const getBalance = vi.fn().mockResolvedValue({ balance: 1000, point: 0 });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send: vi.fn(), getBalance, uploadFile: vi.fn() }),
    });

    // The default price is 20 KRW for SMS, 50 for LMS and 200 for MMS.
    expect(await provider.getRemainCounts()).toEqual({ sms: 50, lms: 20, mms: 5 });
  });

  it('computes the remaining counts by dividing the balance by the price per message', async () => {
    const getBalance = vi.fn().mockResolvedValue({ balance: 10000, point: 0 });
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send: vi.fn(), getBalance, uploadFile: vi.fn() }),
      unitPrice: { sms: 20, lms: 50, mms: 200 },
    });

    expect(await provider.getRemainCounts()).toEqual({ sms: 500, lms: 200, mms: 50 });
  });

  it('wraps an image upload failure in an SmsProviderError', async () => {
    const uploadFile = vi.fn().mockRejectedValue(new Error('File not found'));
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send: vi.fn(), getBalance: vi.fn(), uploadFile }),
    });

    await expect(
      provider.send({
        type: 'MMS',
        sender: '021234567',
        subject: 'Photo',
        content: 'Body',
        imageUrl: 'https://cdn/x.jpg',
        recipients: ['01011112222'],
      }),
    ).rejects.toThrow('Failed to upload MMS image');
  });

  it('wraps a remaining count query failure in an SmsProviderError', async () => {
    const getBalance = vi.fn().mockRejectedValue(new Error('Authentication failed'));
    const provider = createSolapiProvider({
      credentials,
      clientFactory: () => ({ send: vi.fn(), getBalance, uploadFile: vi.fn() }),
    });

    await expect(provider.getRemainCounts()).rejects.toThrow('Failed to fetch remaining counts');
  });
});
