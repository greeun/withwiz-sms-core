/**
 * Static values of the Solapi API. The unit price varies by contract, so it is a default that the
 * caller overrides through SolapiProviderOptions rather than a fixed fact.
 */

/** Price per message. Used to convert a balance into a message count, and it varies by contract. */
export interface SolapiUnitPrice {
  sms: number;
  lms: number;
  mms: number;
}

/** Default price per message in KRW, based on Solapi's public price list. */
export const SOLAPI_DEFAULT_UNIT_PRICE: SolapiUnitPrice = { sms: 20, lms: 50, mms: 200 };

/** Maximum number of messages Solapi accepts in a single send request. */
export const SOLAPI_MAX_RECIPIENTS_PER_REQUEST = 10000;
