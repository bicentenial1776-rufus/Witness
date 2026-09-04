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
// line the `require` of the world in the field screen fails to resolve and
// the app does not build. It is the whole cost of carrying the world inside
// the binary.
//
// The world itself is not under this app: it sits in the one home the
// monorepo gives it, apps/fsv/public/world, which the watchFolders line
// above already lets Metro read. That folder is git-ignored, so the 3 MB
// artifact cannot be committed into this repo by accident; the price is
// that `npm run world:sync -w @witness/fsv` has to have been run before a
// build, and if it has not, the build stops here rather than shipping a
// stand-in that only looks like the world.
config.resolver.assetExts.push('html');

module.exports = config;
