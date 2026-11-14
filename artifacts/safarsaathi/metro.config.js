const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch monorepo root so shared packages (@workspace/*) are watched
config.watchFolders = [monorepoRoot];

// 2. Let Metro resolve packages from project node_modules then root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Force single instance of critical peer dependencies
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@tanstack/react-query": path.resolve(projectRoot, "node_modules/@tanstack/react-query"),
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
  "expo-modules-core": path.resolve(projectRoot, "node_modules/expo-modules-core"),
};

// 4. Custom resolver for web mocks
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "react-native-maps") {
      return {
        filePath: path.resolve(projectRoot, "mocks/react-native-maps.web.js"),
        type: "sourceFile",
      };
    }
    if (moduleName === "expo-sqlite") {
      return {
        filePath: path.resolve(projectRoot, "mocks/expo-sqlite.web.js"),
        type: "sourceFile",
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
