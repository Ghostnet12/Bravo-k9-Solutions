import globals from 'globals';

export default [{
  files: ['server/**/*.js', 'shared/**/*.js', 'api/**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  rules: {
    'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    'no-unreachable': 'error',
    'no-duplicate-imports': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
  },
}];
