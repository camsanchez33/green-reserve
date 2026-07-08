// Common JSON response helpers to reduce boilerplate in API routes.
// Use these in new routes; existing routes can migrate incrementally.
import { NextResponse } from 'next/server';

export const unauthorized = (msg = 'Unauthorized') =>
  NextResponse.json({ error: msg }, { status: 401 });

export const forbidden = (msg = 'Forbidden') =>
  NextResponse.json({ error: msg }, { status: 403 });

export const notFound = (msg = 'Not found') =>
  NextResponse.json({ error: msg }, { status: 404 });

export const badRequest = (msg = 'Bad request') =>
  NextResponse.json({ error: msg }, { status: 400 });

export const conflict = (msg = 'Conflict') =>
  NextResponse.json({ error: msg }, { status: 409 });

export const serverError = (msg = 'Something went wrong') =>
  NextResponse.json({ error: msg }, { status: 500 });
