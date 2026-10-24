/** Release lifecycle + authorization rules. Pure so the tests can cover them directly. */

export const RELEASE_STATUSES = ['Draft', 'Uploading', 'Validating', 'Pending Review', 'Published', 'Rejected', 'Failed', 'Unpublished'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export type Actor = { userId: string; staff: boolean };

/** Only the listing's owner, or Chatting staff, may touch a listing or its releases. */
export function canManage(ownerId: string, a: Actor) {
  return !!a.userId && (a.userId === ownerId || a.staff);
}

/** Developer-driven steps around upload and validation. */
const DEV: Partial<Record<ReleaseStatus, ReleaseStatus[]>> = {
  Draft: ['Uploading', 'Validating'],
  Uploading: ['Validating', 'Failed', 'Draft'],
  Validating: ['Draft', 'Failed'],
  Failed: ['Uploading', 'Validating'],
  Rejected: ['Uploading', 'Validating'],
};

/**
 * Only staff can approve (Pending Review → Published) or reject. Developers can submit a validated draft,
 * unpublish, and roll back to a version staff approved before.
 */
export function canTransition(from: ReleaseStatus, to: ReleaseStatus, a: Actor, opts: { validated: boolean; approvedBefore: boolean }) {
  if (to === 'Pending Review') return from === 'Draft' && opts.validated;
  if (to === 'Published') {
    if (a.staff) return (from === 'Pending Review' || from === 'Unpublished') && opts.validated;
    return from === 'Unpublished' && opts.approvedBefore && opts.validated;
  }
  if (to === 'Rejected') return a.staff && (from === 'Pending Review' || from === 'Published' || from === 'Unpublished');
  if (to === 'Unpublished') return from === 'Published';
  return (DEV[from] ?? []).includes(to);
}

/** Published / submitted / approved releases are immutable: files and manifest can't change. */
export function isImmutable(s: string) {
  return s === 'Pending Review' || s === 'Published' || s === 'Unpublished';
}

export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
