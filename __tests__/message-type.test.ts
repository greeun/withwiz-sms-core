import { describe, expect, it } from 'vitest';
import { byteLength, resolveMessageType } from '../src/message-type';

describe('byteLength', () => {
  it('counts Korean characters as 2 bytes', () => {
    // Korean text is required here: it verifies the EUC-KR 2-byte accounting that the SMS length
    // limit depends on.
    expect(byteLength('가나다')).toBe(6);
  });

  it('counts letters and digits as 1 byte', () => {
    expect(byteLength('abc123')).toBe(6);
  });

  it('counts a line break as 1 byte', () => {
    expect(byteLength('a\nb')).toBe(3);
  });
});

describe('resolveMessageType', () => {
  it('resolves to MMS when an image is present', () => {
    expect(resolveMessageType({ content: 'short text', imageUrl: 'https://x/y.jpg' })).toBe('MMS');
  });

  it('resolves to LMS when the body exceeds 90 bytes', () => {
    // Korean text is required here: 46 Korean characters are 92 bytes under EUC-KR, which crosses
    // the SMS boundary that this case exercises.
    expect(resolveMessageType({ content: '가'.repeat(46) })).toBe('LMS');
  });

  it('resolves to LMS when a subject is present', () => {
    expect(resolveMessageType({ content: 'short text', subject: 'Notice' })).toBe('LMS');
  });

  it('resolves to SMS with no subject, no image and 90 bytes or fewer', () => {
    // 45 Korean characters are exactly 90 bytes, the largest body that still fits in an SMS.
    expect(resolveMessageType({ content: '가'.repeat(45) })).toBe('SMS');
  });
});
