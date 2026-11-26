// Whether a URL is on Vercel Blob's own host. Pure and client-safe: the admin documents page
// runs it in the browser, so this file must never import prisma, Stripe or a secret
// (scripts/client-bundle-test.ts checks). lib/private-blob re-exports it.

/**
 * True only for an https URL on Vercel Blob's own host. `get()` fetches the URL
 * it is given with the store token as a bearer header, so a URL from a request
 * must pass this before it reaches the SDK: a path check alone would let
 * https://attacker.example/course-documents/<id>/x.pdf collect the token.
 */
export function isBlobStoreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}
