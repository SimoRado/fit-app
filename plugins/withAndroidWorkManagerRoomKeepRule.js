const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const MARKER = '# Cubyfit: preserve WorkManager Room implementation for reflective startup';
const RULE = `-keep class androidx.work.impl.WorkDatabase_Impl {
    <init>();
}`;

function addWorkManagerRoomKeepRule(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }

  return `${contents.trimEnd()}\n\n${MARKER}\n${RULE}\n`;
}

/**
 * WorkManager 2.7's Room database is created through reflection before the
 * React Native application starts. R8 otherwise removes its no-argument
 * constructor in a minified APK, leaving the class name but making Room fail
 * at process startup. This keeps only that reflective constructor.
 */
function withAndroidWorkManagerRoomKeepRule(config) {
  return withDangerousMod(config, [
    'android',
    async config => {
      const rulesPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      const contents = await fs.readFile(rulesPath, 'utf8');
      await fs.writeFile(rulesPath, addWorkManagerRoomKeepRule(contents));
      return config;
    },
  ]);
}

module.exports = withAndroidWorkManagerRoomKeepRule;
module.exports.addWorkManagerRoomKeepRule = addWorkManagerRoomKeepRule;
