/**
 * BeatN's public pages (published from site/ by the Pages workflow) and the
 * support address. One place, so the app, the store listing and the pages
 * never disagree.
 */
const SITE = 'https://poovarasan-sandhanam.github.io/BeatN';

export const LINKS = {
  home: `${SITE}/`,
  privacy: `${SITE}/privacy.html`,
  support: `${SITE}/support.html`,
} as const;

export const SUPPORT_EMAIL = 'poovarasanksp001@gmail.com';

/** A support email that carries the app version, and never anything from the journal. */
export function supportMailto(version: string): string {
  const subject = encodeURIComponent(`BeatN ${version} — support`);
  const body = encodeURIComponent(
    `Hi,\n\n\n\n—\nBeatN ${version}\n(Please don't include anything from your journal.)`,
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
