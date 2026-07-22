const { withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = 'Verify GEDCOM file-handler registration';

// One-line so the script survives Xcode project serialization untouched.
const SHELL_SCRIPT =
  'PLIST="${TARGET_BUILD_DIR}/${INFOPLIST_PATH}"; ' +
  'if ! /usr/libexec/PlistBuddy -c "Print :CFBundleDocumentTypes" "$PLIST" >/dev/null 2>&1; then ' +
  'echo "error: Built Info.plist is missing CFBundleDocumentTypes — the .ged/.gdz file-handler registration from app.json was dropped. Re-run: npx expo prebuild -p ios"; ' +
  'exit 1; fi';

/**
 * expo prebuild once generated ios/Witness/Info.plist without the
 * CFBundleDocumentTypes / UTImportedTypeDeclarations blocks from
 * app.json's ios.infoPlist (observed 2026-07-22, after a prebuild whose
 * pod install step crashed midway). ios/ is gitignored, so the loss is
 * invisible until someone notices "Open in Witness" is gone from the
 * Share Sheet. This plugin adds a build phase that fails the build
 * instead.
 */
module.exports = function withGedcomGuard(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    const alreadyAdded = Object.values(phases).some(
      (phase) => phase && typeof phase === 'object' && String(phase.name ?? '').includes('GEDCOM'),
    );
    if (!alreadyAdded) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE_NAME, project.getFirstTarget().uuid, {
        shellPath: '/bin/sh',
        shellScript: SHELL_SCRIPT,
      });
    }
    return config;
  });
};
