// Onboarding (ADMIN-REDO page 3): the definitions behind labels and the page's error wording
// (DENSE: definitions live behind the label, not on the page).

export const overdueTitle = (days: number) => `Waiting ${days}+ days in the same stage`;
export const ACTION_FAILED = (status?: number) =>
  status ? `That didn't go through (error ${status}). Try again.` : "That didn't go through — check your connection and try again.";
export const NO_CAL_LINK = 'Cal.com did not send a link back — try again.';
export const FOOT_PIPELINE = 'Leads, closed inquiries and the full pipeline';
export const FOOT_CSV = 'Download inquiries as CSV';
