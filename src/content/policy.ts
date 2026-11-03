import type { PublicWork, PublicVersion } from '../types.ts';
import type { ContentAccess } from './types.ts';

export type ProjectedVersion = PublicVersion & { contentRestricted: boolean };
export type ProjectedWork = Omit<PublicWork, 'versions'> & { versions: ProjectedVersion[] };

export const PUBLIC_CONTENT_ACCESS: ContentAccess = {
  authenticated: false, eligibility: 'unqualified', displayMode: 'public', canViewRestricted: false,
  requiredPolicyVersion: '2026-11-04-v1', nextAttemptAt: null, attemptsRemaining: 3,
};
export function restrictedAllowed(access: ContentAccess) {
  return access.authenticated && access.eligibility === 'qualified' && access.displayMode === 'restricted' && access.canViewRestricted;
}
export function accessError(access: ContentAccess) {
  if (!access.authenticated) return 'SIGN_IN_REQUIRED';
  if (access.eligibility === 'suspended') return 'CONTENT_SUSPENDED';
  if (access.eligibility === 'needs_retest') return 'CONTENT_RETEST_REQUIRED';
  if (access.eligibility !== 'qualified') return 'CONTENT_QUALIFICATION_REQUIRED';
  return 'CONTENT_MODE_REQUIRED';
}
export function workVisible(work: PublicWork, access: ContentAccess) {
  const state = work.classification?.pageSuitability ?? 'unknown';
  return state === 'sfw' || state === 'nsfw' && restrictedAllowed(access);
}
export function versionAccessError(work: PublicWork, version: PublicVersion, access: ContentAccess): string | null {
  if ((work.classification?.pageSuitability ?? 'unknown') === 'unknown') return 'CONTENT_UNREVIEWED';
  if (!workVisible(work, access)) return accessError(access);
  if (version.classification?.sexualContent !== 'none' && !restrictedAllowed(access)) return accessError(access);
  return null;
}
export function projectWork(work: PublicWork, access: ContentAccess): ProjectedWork | null {
  if (!workVisible(work, access)) return null;
  const versions = work.versions.map(version => {
    const contentRestricted = versionAccessError(work, version, access) !== null;
    return { ...version, contentRestricted,
      ...(contentRestricted ? {
        title: version.classification?.titleSafe ? version.title : `版本 ${version.number} · 受限`,
        notes: '', launchPath: '', checks: [],
      } : {}),
    };
  });
  const primary = versions.find(v => v.id === work.defaultVersionId && !v.contentRestricted)
    ?? versions.find(v => !v.contentRestricted) ?? versions.find(v => v.id === work.defaultVersionId) ?? versions[0];
  const safeMedia = (image: NonNullable<PublicWork['metadata']>['screenshots'][number]) =>
    image.classification?.sexual === 'safe' && image.classification.violence === 'tame';
  return { ...work, defaultVersionId: primary?.id ?? null, versions,
    ...(work.metadata ? { metadata: { ...work.metadata,
      cover: work.metadata.cover && safeMedia(work.metadata.cover) ? work.metadata.cover : null,
      screenshots: work.metadata.screenshots.filter(safeMedia),
    } } : {}),
  };
}
export function safeReturnPath(value: string | null | undefined) {
  if (!value || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return '/';
    const url = new URL(value, 'https://wvn.invalid');
    return url.origin === 'https://wvn.invalid' ? url.pathname + url.search + url.hash : '/';
  } catch { return '/'; }
}
