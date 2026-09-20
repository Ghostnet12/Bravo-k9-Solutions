import globals from 'globals';

const qualityRules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-unreachable': 'error',
  'no-duplicate-imports': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
};

export default [
  {
    files: ['server/**/*.js', 'shared/**/*.js', 'api/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: qualityRules,
  },
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    rules: qualityRules,
  },
];
