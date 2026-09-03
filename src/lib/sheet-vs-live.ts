// MP-5e. Two sides of the same course sit in the database and nothing has ever
// compared them: what the course TOLD us (the inquiry row plus its setup
// sheet) and what golfers actually SEE (the built Course row).
//
// The canonical example is an intake typo that survives to production — an
// inquiry saying "Mahwah, AL" and a live course saying "MAHWAH, NJ". Both
// values are right there, one screen apart, and until now no view put them
// next to each other.
//
// This deliberately does NOT decide which side is correct. A drift can mean an
// admin fixed a typo after building (sheet is stale) or that the build got it
// wrong (live is wrong), and only a human knows which. It makes the
// disagreement visible; that is the whole job.

export type ConfigDrift = {
  field: string;
  label: string;
  /** What the course told us. */
  sheet: string;
  /** What golfers see. */
  live: string;
};

export type InquirySide = {
  courseName: string; courseType: string; address: string; city: string;
  state: string; zipCode: string; phone: string; website: string;
  detailsJson: string;
};

export type LiveSide = {
  name: string; type: string; address: string; city: string; state: string;
  zipCode: string; phone: string; website: string; holes: number; par: number;
  cancellationHours: number; description: string;
};

const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v).trim();
};

/** Same value, allowing for casing and padding — "MAHWAH" is not a drift from "Mahwah". */
const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

export function sheetVsLive(inquiry: InquirySide | null, live: LiveSide): ConfigDrift[] {
  if (!inquiry) return [];

  let sheet: Record<string, unknown> = {};
  try { sheet = inquiry.detailsJson ? JSON.parse(inquiry.detailsJson) : {}; } catch { sheet = {}; }

  const out: ConfigDrift[] = [];
  const push = (field: string, label: string, told: string, shown: string) => {
    // A blank on the intake side is silence, not a request to blank the live
    // course — the same rule the re-submission diff follows.
    if (!told) return;
    if (sameText(told, shown)) return;
    out.push({ field, label, sheet: told, live: shown || '(blank)' });
  };

  // Identity — the builder copies these straight off the inquiry row, so any
  // difference here is a later edit on one side only.
  push('name', 'Course name', text(inquiry.courseName), text(live.name));
  push('type', 'Course type', text(inquiry.courseType), text(live.type));
  push('address', 'Address', text(inquiry.address), text(live.address));
  push('city', 'City', text(inquiry.city), text(live.city));
  push('state', 'State', text(inquiry.state), text(live.state));
  push('zipCode', 'ZIP', text(inquiry.zipCode), text(live.zipCode));
  push('phone', 'Phone', text(inquiry.phone), text(live.phone));

  // Website and description come off the sheet when it supplied them, and the
  // inquiry row otherwise — mirror that precedence rather than inventing one.
  push('website', 'Website', text(sheet.website) || text(inquiry.website), text(live.website));
  push('description', 'Description', text(sheet.description), text(live.description));

  // Config the sheet states as numbers.
  const holes = numOrNull(sheet.holes);
  if (holes !== null && holes !== live.holes) {
    out.push({ field: 'holes', label: 'Holes', sheet: String(holes), live: String(live.holes) });
  }
  const par = numOrNull(sheet.par);
  if (par !== null && par !== live.par) {
    out.push({ field: 'par', label: 'Par', sheet: String(par), live: String(live.par) });
  }
  // The window only means anything if the course opted INTO a cancellation
  // policy. The setup form leaves "24" sitting in cancellationHours even when
  // the course answers "no policy", and the builder correctly writes 0 — so
  // comparing the raw field flagged every no-fee course in production as
  // drifted. A card that cries wolf on the common case gets ignored, which is
  // worse than no card. Mirror the builder's own gate (inquiries route:
  // hasCancellationPolicy) rather than re-deciding it here.
  if (sheet.cancellationPolicy === 'yes') {
    const cancelHours = numOrNull(sheet.cancellationHours);
    if (cancelHours !== null && cancelHours !== live.cancellationHours) {
      out.push({
        field: 'cancellationHours', label: 'Free-cancellation window',
        sheet: `${cancelHours}h`, live: `${live.cancellationHours}h`,
      });
    }
  }

  return out;
}
