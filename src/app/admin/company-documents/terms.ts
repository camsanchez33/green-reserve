// Settings → Company docs: the longer sentences the boxes say, kept apart from the markup (words-guard).
export const RECORD_FAILED = 'The file may be stored; the list has been reloaded, so check it before uploading again.';
export const UPLOAD_HINT = 'A PDF, PNG or JPEG into one of your labels';
export const LABEL_HINT = 'Your own group, like Trademark or Payroll';
export const FILE_RULE = 'PDF, PNG or JPEG, up to 25 MB';
export const STORAGE_REFUSED = 'storage did not accept the file';
export const replacedMsg = (v?: number) => (v ? `Replaced. The old file is kept as version ${v}.` : 'Replaced.');
export const keepsVersion = (v: number) => `The current file stays as version ${v} in its history.`;
export const goneForGood = (versions: boolean) => `It can’t be recovered${versions ? ', and its earlier versions go with it' : ''}.`;
export const moveFirst = (n: number) => `To remove it, move its ${n} document${n > 1 ? 's' : ''} to`;
export const LABEL_REMOVED_MOVED = 'Label removed; its documents moved.';
