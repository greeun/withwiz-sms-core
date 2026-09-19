import { describe, expect, it } from 'vitest';
import { assertSendableRecipients, assertValidSender } from '../src/send-validation';

describe('public entry point', () => {
  it('exposes the sender check alongside the recipient check', async () => {
    const mod = await import('../src/index');

    expect(mod.isValidSenderPhone('1588-1234')).toBe(true);
    expect(mod.isValidMobilePhone('1588-1234')).toBe(false);
  });
});

describe('assertValidSender', () => {
  it('accepts the sender formats providers actually use', () => {
    expect(() => assertValidSender('02-123-4567')).not.toThrow();
    expect(() => assertValidSender('1588-1234')).not.toThrow();
    expect(() => assertValidSender('010-1234-5678')).not.toThrow();
  });

  it('rejects a missing sender', () => {
    expect(() => assertValidSender('')).toThrow(/sender/i);
  });

  it('rejects a sender that is not a phone number, without repeating the value', () => {
    expect(() => assertValidSender('12345')).toThrow(/sender/i);
    expect(() => assertValidSender('12345')).not.toThrow(/12345/);
  });
});

describe('assertSendableRecipients', () => {
  it('accepts a list of valid mobile numbers', () => {
    expect(() =>
      assertSendableRecipients(['010-1111-2222', '01033334444'], 1000),
    ).not.toThrow();
  });

  it('rejects an empty list', () => {
    expect(() => assertSendableRecipients([], 1000)).toThrow(/no recipient/i);
  });

  it('reports the position of an invalid number without repeating the number itself', () => {
    // A number belongs to a person, so an error that ends up in a log must not carry it.
    expect(() => assertSendableRecipients(['01011112222', '0212345678'], 1000)).toThrow(
      /index 1/i,
    );
    expect(() => assertSendableRecipients(['01011112222', '0212345678'], 1000)).not.toThrow(
      /0212345678/,
    );
  });

  it('reports every invalid position at once', () => {
    expect(() =>
      assertSendableRecipients(['0212345678', '01011112222', 'not a number'], 1000),
    ).toThrow(/0, 2/);
  });

  it('rejects a list longer than the provider accepts', () => {
    const recipients = Array.from({ length: 1001 }, () => '01011112222');

    expect(() => assertSendableRecipients(recipients, 1000)).toThrow(/1001 given/i);
  });

  it('accepts a list that sits exactly at the limit', () => {
    const recipients = Array.from({ length: 1000 }, () => '01011112222');

    expect(() => assertSendableRecipients(recipients, 1000)).not.toThrow();
  });
});
