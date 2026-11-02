// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // Editable form screens hydrate their field state from persisted records.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
