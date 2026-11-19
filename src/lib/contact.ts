// MAIL-1 (Cam 2026-10-22): GreenReserve's addresses, one per audience. All three
// are Google Workspace aliases of one inbox, so a reply always reaches Cam;
// the split lets Gmail filter by who wrote. Every page, email and legal
// notice reads from here — never type an address anywhere else.
// (Was thegreenreserve@outlook.com everywhere, with hello@ a send-only From.)

/** Golfers, the homepage and public pages, privacy and general questions. */
export const SUPPORT_EMAIL = 'support@greenreserve.app';

/** Courses talking to GreenReserve: enquiries, onboarding, the dashboard, the
 *  agreement. Also where the site's own alerts are sent. */
export const ADMIN_EMAIL = 'admin@greenreserve.app';

/** Money: receipts, charges, refunds, pay links, membership dues. */
export const BILLING_EMAIL = 'billing@greenreserve.app';

/** From address for golfer emails (sent in the course's name), codes, sign-in links,
 *  security alerts and routine staff notices. Deliberately NOT a Workspace alias:
 *  replies bounce. Never show it as a contact. */
export const NOREPLY_EMAIL = 'noreply@greenreserve.app';

/** Outreach (emails redo, Cam 2026-11-19): GreenReserve's postal address, printed in the footer of every
 *  outreach email as CAN-SPAM requires. Cam still owes it. While it is empty, sendOutreachEmail() refuses
 *  to send — an outreach email without it would break the law. Fill it in here, nowhere else. */
export const OUTREACH_POSTAL_ADDRESS = '';
