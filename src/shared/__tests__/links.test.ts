import { LINKS, SUPPORT_EMAIL, supportMailto } from '../links';

describe('links', () => {
  it('points at the published pages', () => {
    expect(LINKS.privacy).toBe('https://poovarasan-sandhanam.github.io/BeatN/privacy.html');
    expect(LINKS.support).toBe('https://poovarasan-sandhanam.github.io/BeatN/support.html');
  });

  it('builds a support email that carries the version and asks for no journal content', () => {
    const url = supportMailto('1.0.0 (9)');
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    const body = decodeURIComponent(url.split('body=')[1]);
    expect(decodeURIComponent(url.split('subject=')[1].split('&')[0])).toBe('BeatN 1.0.0 (9) — support');
    expect(body).toContain('BeatN 1.0.0 (9)');
    expect(body).toContain("don't include anything from your journal");
  });
});
