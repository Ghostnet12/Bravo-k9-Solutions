import expo from 'eslint-config-expo/flat.js';
export default [...expo, { ignores: ['dist/**', 'android/**', 'ios/**', '.expo/**', 'test-results/**', 'playwright-report/**'] }];
