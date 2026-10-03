/**
 * llama.rn is a native module and cannot run under Jest. See whisper.rn.js.
 */
module.exports = {
  initLlama: jest.fn(async () => {
    throw new Error('llama.rn is not available under Jest');
  }),
};
