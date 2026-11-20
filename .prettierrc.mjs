/** @type {import('prettier').Config} */
const config = {
  plugins: ['@trivago/prettier-plugin-sort-imports'],

  printWidth: 80,
  tabWidth: 2,
  useTabs: false,

  semi: true,
  singleQuote: true,
  quoteProps: 'consistent',
  trailingComma: 'es5',

  bracketSpacing: true,
  bracketSameLine: false,

  arrowParens: 'always',
  proseWrap: 'preserve',
  htmlWhitespaceSensitivity: 'css',
  endOfLine: 'lf',
  embeddedLanguageFormatting: 'auto',
  singleAttributePerLine: false,

  importOrder: [
    '<BUILTIN_MODULES>',
    '<THIRD_PARTY_MODULES>',
    '^@(main|renderer|shared)/', // aliases
    '^\\.(?!.*\\.s?css$)', // local files but styles
    '\\.s?css$', // styles
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: false,
  importOrderGroupNamespaceSpecifiers: false,
  importOrderCaseInsensitive: false,
  importOrderParserPlugins: ['typescript', 'jsx'],
};

export default config;
