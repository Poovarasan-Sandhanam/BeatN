const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  // Trailing slash is load-bearing: require.resolve('buffer') returns the
  // string 'buffer' because Node resolves it as a core module, so the alias
  // would point at itself rather than at node_modules/buffer.
  buffer: require.resolve('buffer/'),
};

module.exports = config;
