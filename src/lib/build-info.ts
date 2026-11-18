// docs/RELEASES.md §7 (Build OK 2026-11-18): the short commit of the build that answers /api/health,
// so the post-deploy check (scripts/release.mjs check --expect-sha) can tell the release just merged
// from a rolled-back or stale build. Seven characters, no framework or version (SEC-1). The live
// production commit is already public through GitHub's deployments list. null outside Vercel.
export function liveCommit(env: Record<string, string | undefined> = process.env): string | null {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? '').trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;
}
