'use client';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Btn } from './Btn';
import { LOGIN_SESSION_ENDED, type AdminFetchFailure } from '@/lib/admin-fetch';

/**
 * The two canonical failure surfaces for the admin console.
 *
 * MP-2c: MP-2b added twelve error states in five different shapes — four
 * radius/padding pairs, two text sizes, three retry affordances, and two
 * colour treatments for one semantic state — while Btn and the rest of
 * components/ui sat unused in the same files. ADMIN_V4 LAW rule 3 is "SHARED
 * COMPONENTS OR IT DIDN'T HAPPEN". These two are that, and their shape is the
 * one already dominant in the repo (revenue's expense banner and the
 * course-detail load-failure card), not a new invention.
 *
 * Both take `kind` so a session that has ended always offers the way back in —
 * the single most common failure now that deactivation is checked per request.
 */

function SignInLink() {
  return (
    <Link href={LOGIN_SESSION_ENDED} className="text-xs font-medium text-pine hover:underline shrink-0">
      Sign in
    </Link>
  );
}

/**
 * Inline banner. Sits above the content it describes and leaves it in place —
 * use when there is still something on screen worth keeping (stale numbers, a
 * loaded list, a form).
 */
export function ErrorBanner({ message, kind, onRetry, onDismiss, className = '' }: {
  message: string;
  kind?: AdminFetchFailure;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div className={'mb-4 rounded-md bg-bad/5 border border-bad/20 px-4 py-2.5 flex items-start justify-between gap-3 ' + className}>
      <p className="text-xs text-bad">{message}</p>
      <div className="flex items-center gap-3 shrink-0">
        {kind === 'unauthorized' && <SignInLink />}
        {onRetry && kind !== 'unauthorized' && kind !== 'forbidden' && (
          <button onClick={onRetry} className="text-xs font-medium text-ink-soft hover:text-ink transition-colors">Retry</button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" className="text-ink-muted hover:text-ink transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Full-surface failure. Use where there is nothing else to show — an empty list
 * slot, or a detail page whose subject never loaded.
 *
 * Retry is PRIMARY here, matching the pre-existing card in
 * admin/courses/[id]/page.tsx. MP-2b built the inquiry-detail twin with the
 * variants inverted, so two sibling pages taught opposite muscle memory for the
 * same failure.
 */
export function LoadFailure({ message, kind, onRetry, secondaryLabel, onSecondary, compact = false }: {
  message: string;
  kind?: AdminFetchFailure;
  onRetry?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
}) {
  // Retrying a 401 or a 403 just reproduces it — offer the action that helps.
  const retryable = !!onRetry && kind !== 'unauthorized' && kind !== 'forbidden';
  return (
    <div className={'rounded-lg border border-bad/20 bg-bad/5 text-center ' + (compact ? 'px-5 py-6' : 'px-6 py-8')}>
      <p className="text-sm text-bad mb-4">{message}</p>
      <div className="flex items-center justify-center gap-2">
        {retryable && <Btn onClick={onRetry}>Retry</Btn>}
        {kind === 'unauthorized' && (
          <Link href={LOGIN_SESSION_ENDED}>
            <Btn>Sign in</Btn>
          </Link>
        )}
        {secondaryLabel && onSecondary && (
          <Btn variant="secondary" onClick={onSecondary}>{secondaryLabel}</Btn>
        )}
      </div>
    </div>
  );
}
