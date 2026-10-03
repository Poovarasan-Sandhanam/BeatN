/**
 * whisper.rn is a native module. Under Jest the specifier `whisper.rn/index`
 * resolves to a .d.ts (the package's exports map has no runtime "." entry),
 * which Jest cannot execute. Tests stub the engine's behaviour anyway, so this
 * only needs to satisfy the import.
 */
module.exports = {
  initWhisper: jest.fn(async () => {
    throw new Error('whisper.rn is not available under Jest');
  }),
};
