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

/** From address for codes, sign-in links and security alerts. Deliberately NOT
 *  a Workspace alias: replies bounce. Never show it as a contact. */
export const NOREPLY_EMAIL = 'noreply@greenreserve.app';
