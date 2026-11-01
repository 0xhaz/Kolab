// Privy needs `jose` resolved to its browser build (the Node build imports zlib) and
// package exports enabled for its own subpath imports.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jose') {
    const ctx = { ...context, unstable_conditionNames: ['browser'] };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  if (moduleName.startsWith('@privy-io/')) {
    const ctx = { ...context, unstable_enablePackageExports: true };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Native build output (Xcode DerivedData, Gradle) is never JS input and its lock files break the watcher.
const nativeBuild = /[/\\](ios|android)[/\\]build[/\\].*/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing ? [].concat(existing, nativeBuild) : nativeBuild;

module.exports = config;
