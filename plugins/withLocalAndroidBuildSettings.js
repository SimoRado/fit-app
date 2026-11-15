const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

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
const JOB_POOL_MARKER = '// Cubyfit: bound concurrent C++ compiles';
// Gradle's worker limit does not reach Ninja, which otherwise starts one clang
// per CPU thread for the app's native modules. On this 8 GB machine a full
// recompile then fails with "LLVM ERROR: out of memory" / paging file too small.
function addCmakeJobPools(contents) {
  if (contents.includes(JOB_POOL_MARKER)) return contents;
  const anchor = /defaultConfig \{\n/;
  if (!anchor.test(contents)) throw new Error('withLocalAndroidBuildSettings: build.gradle has no defaultConfig block');
  return contents.replace(anchor, match => `${match}        ${JOB_POOL_MARKER}\n        externalNativeBuild { cmake { arguments "-DCMAKE_JOB_POOLS=cubyfit_compile=2;cubyfit_link=1", "-DCMAKE_JOB_POOL_COMPILE=cubyfit_compile", "-DCMAKE_JOB_POOL_LINK=cubyfit_link" } }\n`);
}

module.exports = function withLocalAndroidBuildSettings(config) {
  config = withAppBuildGradle(config, config => {
    config.modResults.contents = addCmakeJobPools(config.modResults.contents);
    return config;
  });
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
