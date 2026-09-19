import { describe, expect, it } from 'vitest';
import {
  formatKoreanPhone,
  isValidMobilePhone,
  isValidSenderPhone,
  normalizePhone,
} from '../src/phone';

describe('isValidSenderPhone', () => {
  it('accepts the landline formats a sender number normally takes', () => {
    expect(isValidSenderPhone('02-123-4567')).toBe(true);
    expect(isValidSenderPhone('02-1234-5678')).toBe(true);
    expect(isValidSenderPhone('031-123-4567')).toBe(true);
    expect(isValidSenderPhone('070-1234-5678')).toBe(true);
  });

  it('accepts a mobile number as a sender', () => {
    expect(isValidSenderPhone('010-1234-5678')).toBe(true);
  });

  it('accepts a representative number, which carries no leading zero', () => {
    expect(isValidSenderPhone('1588-1234')).toBe(true);
    expect(isValidSenderPhone('1644-5678')).toBe(true);
    expect(isValidSenderPhone('1800-1234')).toBe(true);
  });

  it('rejects an empty or missing value', () => {
    expect(isValidSenderPhone('')).toBe(false);
    expect(isValidSenderPhone(null)).toBe(false);
    expect(isValidSenderPhone(undefined)).toBe(false);
  });

  it('rejects a number of the wrong length', () => {
    expect(isValidSenderPhone('02-123')).toBe(false);
    expect(isValidSenderPhone('010-1234-56789')).toBe(false);
  });

  it('rejects an eight-digit number outside the representative range', () => {
    expect(isValidSenderPhone('1234-5678')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('removes every non-digit character', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone('+82 10 1234 5678')).toBe('821012345678');
  });
});

describe('formatKoreanPhone', () => {
  it('breaks a mobile number into 3-4-4', () => {
    expect(formatKoreanPhone('01012345678')).toBe('010-1234-5678');
  });

  it('breaks the Seoul area code after 2 digits', () => {
    expect(formatKoreanPhone('021234567')).toBe('02-123-4567');
    expect(formatKoreanPhone('0212345678')).toBe('02-1234-5678');
  });

  it('breaks only as far as a short input allows', () => {
    expect(formatKoreanPhone('010')).toBe('010');
    expect(formatKoreanPhone('0101234')).toBe('010-1234');
  });

  it('truncates anything beyond the maximum digit count', () => {
    expect(formatKoreanPhone('010123456789999')).toBe('010-1234-5678');
  });
});

describe('isValidMobilePhone', () => {
  it('accepts 10 to 11 digits starting with 01', () => {
    expect(isValidMobilePhone('010-1234-5678')).toBe(true);
    expect(isValidMobilePhone('0111234567')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isValidMobilePhone('02-123-4567')).toBe(false);
    expect(isValidMobilePhone('0101234')).toBe(false);
    expect(isValidMobilePhone(null)).toBe(false);
    expect(isValidMobilePhone(undefined)).toBe(false);
  });
});
