/**
 * Static values of the Aligo API. They are collected here rather than written into the adapter so
 * that an endpoint change or a contract-specific limit is edited in one place.
 */

/** Aligo's single message sending endpoint (SMS/LMS/MMS are distinguished by msg_type) */
export const ALIGO_SEND_URL = 'https://apis.aligo.in/send/';

/** Aligo's endpoint for querying the remaining sendable message counts */
export const ALIGO_REMAIN_URL = 'https://apis.aligo.in/remain/';

/** Aligo accepts up to 1,000 comma separated recipients in a single request. */
export const ALIGO_MAX_RECIPIENTS_PER_REQUEST = 1000;

/**
 * File name attached to an inline MMS upload. Aligo requires the multipart part to carry a name,
 * and the extension is what identifies the image format.
 */
export const ALIGO_MMS_FILE_NAME = 'mms.jpg';
