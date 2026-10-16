const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'ios/*',
      'android/*',
      'node_modules/*',
      'vendor/*',
      'build/*',
      // exFAT AppleDouble sidecars are binary, not source. See DEVELOPMENT.md.
      '**/._*',
    ],
  },
  {
    // Node scripts and Jest mocks are not app code: they legitimately use
    // Node globals, and a build script is allowed to print.
    files: ['scripts/**/*.js', 'jest/**/*.js', 'metro.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', module: 'writable', require: 'readonly', jest: 'readonly', console: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Strict rules apply to app code only.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // The privacy rule from SYSTEM_DESIGN.md §10, enforced by the linter as
      // well as by src/__tests__/architecture.test.ts. Transcripts, prompts
      // and model output must never reach a log sink.
      'no-console': 'error',
      // Hook dependency mistakes have bitten twice in this project already.
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
