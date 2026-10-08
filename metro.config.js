const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  // Trailing slash is load-bearing: require.resolve('buffer') returns the
  // string 'buffer' because Node resolves it as a core module, so the alias
  // would point at itself rather than at node_modules/buffer.
  buffer: require.resolve('buffer/'),
};

// exFAT cannot store extended attributes, so macOS writes an AppleDouble
// sidecar (`._name`) next to every file it touches. Those are binary blobs,
// and Expo Router globs `src/app/**`, so `._record.tsx` was being picked up as
// a *route* and handed to Babel. Block them at the resolver so no build can
// see them, whatever the cleanup script missed.
config.resolver.blockList = [/(^|[/\\])\._[^/\\]*$/];

module.exports = config;
