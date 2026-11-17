import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'workspace/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
