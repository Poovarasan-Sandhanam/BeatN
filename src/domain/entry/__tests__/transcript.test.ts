import { cleanTranscript } from '../transcript';

describe('cleanTranscript', () => {
  it.each([
    '[BLANK_AUDIO]',
    ' [BLANK_AUDIO] ',
    '(silence)',
    '[ Silence ]',
    '[MUSIC]',
    '(music playing)',
    '[Inaudible]',
    '[BLANK_AUDIO] [BLANK_AUDIO]',
  ])('treats %p as no speech', (raw) => {
    expect(cleanTranscript(raw)).toBe('');
  });

  it('removes tags around real speech', () => {
    expect(cleanTranscript('[BLANK_AUDIO] I went for a walk. [MUSIC]')).toBe('I went for a walk.');
  });

  it('keeps brackets that are part of what was said', () => {
    expect(cleanTranscript('Plan A (the cheap one) won.')).toBe('Plan A (the cheap one) won.');
    expect(cleanTranscript('Call [Sam] tomorrow.')).toBe('Call [Sam] tomorrow.');
  });

  it('collapses whitespace left behind', () => {
    expect(cleanTranscript('  Hello   [silence]   there  ')).toBe('Hello there');
  });

  it('leaves ordinary text untouched', () => {
    expect(cleanTranscript("I'm taking everything on there.")).toBe("I'm taking everything on there.");
  });
});
