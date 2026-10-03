#!/usr/bin/env node
/**
 * Removes macOS AppleDouble sidecars ("._foo") from the project.
 *
 * When the project lives on a non-HFS/APFS volume (this repo sits on an exFAT
 * external SSD), macOS stores extended attributes in a companion "._" file for
 * every file it writes. That breaks the native toolchains, which glob by name:
 *
 *   - CocoaPods evaluates `._Something.podspec` as Ruby and fails outright.
 *   - patch-package reads `._name+version.patch` as a patch for a package
 *     called `._name` and reports it as missing.
 *   - CocoaPods sees both `App.xcodeproj` and `._App.xcodeproj` and reports
 *     that it "could not automatically select an Xcode project".
 *
 * Runs as a postinstall hook and again before `pod install`. It is a no-op on
 * platforms other than macOS. Pass directories as arguments to override the
 * defaults.
 */
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const projectRoot = path.join(__dirname, '..');
const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((target) => path.resolve(projectRoot, target))
  : ['node_modules', 'ios', 'android', 'patches'].map((dir) => path.join(projectRoot, dir));

let removed = 0;

/** @param {string} dir */
function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory: nothing we can clean here
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('._')) {
      // Sidecars are always plain files, even when they shadow a directory.
      try {
        fs.unlinkSync(full);
        removed += 1;
      } catch {
        // Best effort: one undeletable sidecar is not worth failing the build.
      }
    } else if (entry.isDirectory()) {
      walk(full);
    }
  }
}

for (const target of targets) {
  if (fs.existsSync(target)) walk(target);
}

if (removed > 0) {
  console.log(`strip-appledouble: removed ${removed} AppleDouble sidecar file(s)`);
}
