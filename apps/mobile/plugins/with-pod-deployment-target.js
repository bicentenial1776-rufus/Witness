const { withPodfile } = require('expo/config-plugins');

const MARKER = 'Xcode 27 refuses deployment targets below iOS 15';

// Indented to sit inside `post_install do |installer|`. Reads the same
// podfile_properties value the Podfile's `platform :ios` line uses, so the
// floor follows app.json's ios.deploymentTarget if one is ever set.
const HOOK = `
    # ${MARKER} (a hard error since Xcode 27, not a
    # warning). Several pods' resource-bundle targets still declare 9.0–13.0
    # (RevenueCat, PurchasesHybridCommon, SuperwallKit, AsyncStorage,
    # react-native-view-shot); lift them to the app's own target.
    floor = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < 15.0
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor
        end
      end
    end
`;

/**
 * Archiving with Xcode 27 (2026-09-16) failed on five pod resource-bundle
 * targets whose IPHONEOS_DEPLOYMENT_TARGET sat below the 15.0 minimum the
 * new toolchain enforces. ios/ is gitignored and prebuild regenerates the
 * Podfile, so the post_install fix lives here rather than in the Podfile.
 */
module.exports = function withPodDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;
    if (podfile.includes(MARKER)) return config;
    const anchor = 'post_install do |installer|\n';
    const at = podfile.indexOf(anchor);
    if (at === -1) {
      throw new Error('with-pod-deployment-target: no post_install block found in the generated Podfile');
    }
    const insertAt = at + anchor.length;
    config.modResults.contents = podfile.slice(0, insertAt) + HOOK + podfile.slice(insertAt);
    return config;
  });
};
