// Emails and texts redo (Cam 2026-11-19): greenreserve.app/r/<code>, a text's short link (lib/short-links).
import { shortLinkRoute } from '@/lib/short-links';

export const dynamic = 'force-dynamic';
export const GET = shortLinkRoute('r');
