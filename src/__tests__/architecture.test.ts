/**
 * Executable architecture rules.
 *
 * SYSTEM_DESIGN.md §2 states the dependency rule. A rule nobody checks is a
 * suggestion, so it is checked here: these tests fail the build the first time
 * someone imports SQLite into the domain or llama.rn into a screen.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    // exFAT AppleDouble sidecars are binary, not source. See DEVELOPMENT.md.
    if (name.startsWith('._')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*import\s[^'"]*from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
  return specifiers;
}

const describeFile = (file: string) => relative(SRC, file);

describe('dependency rule: src/domain is pure', () => {
  const files = sourceFiles(join(SRC, 'domain'));

  it('contains source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [describeFile(f), f]))(
    '%s imports no platform, UI, or persistence library',
    (_name, file) => {
      const forbidden = importsOf(file).filter((specifier) =>
        /^(react|react-native|expo|expo-.*|@expo\/.*|llama\.rn|whisper\.rn|zod)($|\/)/.test(
          specifier,
        ),
      );
      expect(forbidden).toEqual([]);
    },
  );

  it.each(files.map((f) => [describeFile(f), f]))(
    '%s does not reach outside the domain layer',
    (_name, file) => {
      const escaping = importsOf(file).filter(
        (specifier) => specifier.startsWith('.') && /(^|\/)\.\.\/(core|features|app|services)\//.test(specifier),
      );
      expect(escaping).toEqual([]);
    },
  );
});

describe('dependency rule: UI does not touch AI runtimes or SQLite', () => {
  const uiDirs = ['spike', 'features', 'app'].map((d) => join(SRC, d));
  const files = uiDirs.flatMap((dir) => {
    try {
      return sourceFiles(dir);
    } catch {
      return []; // directory not created yet
    }
  });

  it('contains source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [describeFile(f), f]))(
    '%s imports no AI runtime or database driver directly',
    (_name, file) => {
      const forbidden = importsOf(file).filter((specifier) =>
        /^(llama\.rn|whisper\.rn|expo-sqlite)($|\/)/.test(specifier),
      );
      expect(forbidden).toEqual([]);
    },
  );
});

describe('privacy rule: nothing logs to the console', () => {
  // Every shipping directory, not just the engines: a transcript logged from a
  // screen leaks exactly as badly as one logged from a repository.
  const files = ['core', 'domain', 'shared', 'features', 'spike', 'app'].flatMap((dir) => {
    try {
      return sourceFiles(join(SRC, dir));
    } catch {
      return []; // directory not created yet
    }
  });

  it.each(files.map((f) => [describeFile(f), f]))('%s contains no console.log', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    // Transcripts, prompts and model output must never reach a log sink.
    // See SYSTEM_DESIGN.md §10.
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)\s*\(/);
  });
});
