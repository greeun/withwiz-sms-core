/** Removes every non-digit character. Used to normalize a number before putting it in a send request. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Input-restricting formatter for Korean phone numbers.
 *
 * Removes every non-digit character and inserts hyphens according to the digit count.
 * Using it in an input field's onChange effectively limits the characters a user can
 * type to digits and hyphens.
 *
 * Supported formats
 *  - Mobile / area codes with a 3-digit prefix: 010-1234-5678, 031-123-4567, etc. (3-4-4 / 3-3-4)
 *  - Seoul area code (02): 02-123-4567, 02-1234-5678 (2-3-4 / 2-4-4)
 */
export function formatKoreanPhone(value: string): string {
  const digits = normalizePhone(value);

  // Seoul area code 02 (2-digit area code, 9 to 10 digits in total)
  if (digits.startsWith('02')) {
    const d = digits.slice(0, 10);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }

  // Mobile / other area codes (3-digit prefix, up to 11 digits in total)
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/**
 * Validates a mobile phone number.
 * Extracts the digits and checks for the pattern `01` followed by 8 to 9 digits
 * (10 to 11 digits in total). This is the single source of truth for recipient validation.
 */
export function isValidMobilePhone(value: string | null | undefined): boolean {
  return /^01\d{8,9}$/.test(normalizePhone(value ?? ''));
}

/**
 * Validates a sender number, which follows wider rules than a recipient does.
 *
 * A sender is often a landline (`02-123-4567`) or a representative number (`1588-1234`) rather than
 * a mobile number, so isValidMobilePhone is too narrow for it. Two shapes are accepted: a number
 * starting with 0 that is 9 to 11 digits long, and an 8-digit representative number in the 15xx,
 * 16xx and 18xx ranges.
 *
 * Passing this check does not make a number usable. Providers only send from numbers registered to
 * the account in advance, and that can be confirmed nowhere but at the provider.
 */
export function isValidSenderPhone(value: string | null | undefined): boolean {
  return /^(0\d{8,10}|1[568]\d{6})$/.test(normalizePhone(value ?? ''));
}
