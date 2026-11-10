import { GENERIC_MESSAGE, describeError, isCancellation, isPermissionError } from '../errors';

describe('describeError', () => {
  it('maps a known code to plain language', () => {
    expect(describeError(new Error('RECORDING_EMPTY'))).toBe(
      'No audio was captured. Please try recording again.',
    );
  });

  it('handles a non-Error value', () => {
    expect(describeError('MODEL_DOWNLOAD_FAILED')).toContain('did not finish');
  });

  it('passes an unknown message through in development', () => {
    expect(describeError(new Error('SOMETHING_ODD'))).toBe('SOMETHING_ODD');
  });

  it('never shows an unknown native message in a release build', () => {
    const globals = globalThis as { __DEV__?: boolean };
    const previous = globals.__DEV__;
    globals.__DEV__ = false;
    try {
      expect(describeError(new Error('std::exception at /var/mobile/x'))).toBe(GENERIC_MESSAGE);
      // Known codes are still translated.
      expect(describeError(new Error('MODEL_DOWNLOAD_CORRUPT'))).toContain('damaged');
    } finally {
      globals.__DEV__ = previous;
    }
  });
});

describe('isPermissionError', () => {
  it('recognises a denied microphone', () => {
    expect(isPermissionError(new Error('MICROPHONE_PERMISSION_DENIED'))).toBe(true);
  });

  it('does not treat other failures as permission problems', () => {
    expect(isPermissionError(new Error('RECORDING_EMPTY'))).toBe(false);
    expect(isPermissionError(new Error('MODEL_DOWNLOAD_FAILED'))).toBe(false);
  });
});

describe('isCancellation', () => {
  it('recognises a cancelled bundle install', () => {
    expect(isCancellation(new Error('BUNDLE_INSTALL_CANCELLED'))).toBe(true);
  });

  it('recognises an aborted inference', () => {
    expect(isCancellation(new Error('INFERENCE_ABORTED:transcribe'))).toBe(true);
  });

  it('does not treat a real failure as a cancellation', () => {
    expect(isCancellation(new Error('MODEL_DOWNLOAD_FAILED'))).toBe(false);
  });
});
