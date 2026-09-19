import { isValidMobilePhone, isValidSenderPhone } from './phone';

/**
 * Checks the number a message will be sent from.
 *
 * Only the shape is checked here. Whether the number is registered to the account is something no
 * local check can answer, so a number that passes may still be rejected by the provider.
 */
export function assertValidSender(sender: string): void {
  if (!isValidSenderPhone(sender)) {
    // The value is left out of the message for the same reason recipient numbers are.
    throw new Error('Sender number is missing or is not a valid phone number.');
  }
}

/**
 * Checks a recipient list against what the provider will actually accept.
 *
 * Both rules were previously documented but never enforced: isValidMobilePhone described itself as
 * the single source of truth for recipient validation while no send path called it, and
 * maxRecipientsPerRequest was declared through capabilities while an oversized list was forwarded
 * as it was. An adapter that states a limit has to hold itself to it.
 *
 * An invalid entry rejects the whole request rather than being filtered out, because a caller that
 * is not told about the omission would believe every recipient was reached. A caller that does want
 * to drop bad entries can filter with isValidMobilePhone before calling send.
 */
export function assertSendableRecipients(recipients: string[], maxPerRequest: number): void {
  if (recipients.length === 0) {
    throw new Error('No recipient was given.');
  }

  if (recipients.length > maxPerRequest) {
    throw new Error(
      `Too many recipients: ${recipients.length} given, the provider accepts at most ${maxPerRequest} per request.`,
    );
  }

  // Positions are reported rather than the numbers themselves: an error message travels into logs,
  // and a phone number is personal data that does not belong there.
  const invalidPositions = recipients
    .map((phone, index) => (isValidMobilePhone(phone) ? -1 : index))
    .filter((index) => index !== -1);

  if (invalidPositions.length > 0) {
    throw new Error(
      `Recipient list contains numbers that are not valid mobile numbers, at index ${invalidPositions.join(', ')}.`,
    );
  }
}
