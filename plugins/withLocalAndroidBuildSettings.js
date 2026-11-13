const { withGradleProperties } = require('@expo/config-plugins');

function setProperty(properties, key, value) {
  const existing = properties.find(item => item.type === 'property' && item.key === key);
  if (existing) existing.value = value;
  else properties.push({ type: 'property', key, value });
}

/**
 * Keeps local Windows builds inside Ninja's supported object-path range.
 *
 * Expo SDK 58 defaults CMAKE_OBJECT_PATH_MAX to 1024. The bundled Ninja in
 * CMake 3.22.1 still has the classic Windows path limitation, so deeply
 * nested React Native codegen paths can fail when that higher limit is used.
 */
module.exports = function withLocalAndroidBuildSettings(config) {
  return withGradleProperties(config, config => {
    setProperty(config.modResults, 'expo.android.cmakeObjectPathMax', '240');
    // This machine has 8 GB RAM. Bound concurrent Kotlin/CMake work instead
    // of changing React Native's architecture or native feature flags.
    setProperty(config.modResults, 'org.gradle.parallel', 'false');
    setProperty(config.modResults, 'org.gradle.workers.max', '2');
    setProperty(config.modResults, 'kotlin.daemon.jvmargs', '-Xmx1024m');
    return config;
  });
};
