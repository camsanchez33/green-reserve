// SEC-2 (Cam 2026-10-26, "security has to be insane"): what Sentry may collect.
// From v11, Sentry left alone collects cookies, every request and response
// body (login passwords, card-setup payloads), user info, URL query strings
// (check-in and pay links carry their token there), database query data,
// local variables in stack frames and AI prompts (Birdie). v8 sent none of
// that. GreenReserve sends errors and their stack, nothing a person typed:
// every field is set here, so a future default can't widen it.
import type { BrowserOptions } from '@sentry/nextjs';

export const SENTRY_DATA_COLLECTION: NonNullable<BrowserOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  // Only what helps read an error; never Authorization, Cookie or Referer.
  httpHeaders: { request: { allow: ['user-agent', 'content-type', 'accept-language'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 5,
};
