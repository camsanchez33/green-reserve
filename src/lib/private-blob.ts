// @brain private-file-storage
// Contracts and signed agreements live in their OWN, private Vercel Blob store
// (Cam 2026-09-29). The main store (BLOB_READ_WRITE_TOKEN) is public — course
// and sheet photos must be viewable by golfers — and a public store refuses
// `access: 'private'` writes, which is how contract uploads failed on the
// first live test. Every private put/get passes this token explicitly.
//
// Setup: Vercel → Storage → create a Blob store with access PRIVATE, connect
// it to the project with the env prefix `BLOB_PRIVATE` and the "read-write
// token" box ticked (that creates BLOB_PRIVATE_READ_WRITE_TOKEN), redeploy.

export function privateBlobToken(): string | undefined {
  return process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || undefined;
}

export const PRIVATE_STORAGE_MISSING =
  'Private file storage for contracts is not set up yet (BLOB_PRIVATE_READ_WRITE_TOKEN). Add the private Blob store in Vercel, then redeploy.';

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
