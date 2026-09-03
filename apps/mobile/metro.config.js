const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo support: let Metro see @witness/core (and the hoisted root
// node_modules) outside this app's own directory.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The walkable world is one self-contained web page, and Metro ships a web
// page only if it is told that a web page is a shippable file. Without this
// line `require('@/assets/world/witness_fsv_demo.html')` in the field screen
// fails to resolve and the app does not build. It is the whole cost of
// carrying the world inside the binary.
config.resolver.assetExts.push('html');

module.exports = config;
