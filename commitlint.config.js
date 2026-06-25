module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'test', 'chore', 'perf', 'ci', 'build', 'revert',
    ]],
    'scope-case': [2, 'always', 'kebab-case'],
    'scope-enum': [0, 'always'], // Allow any scope
    'subject-case': [2, 'never', ['sentence-case', 'start-case']],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
};
