# eslint-plugin-protected-imports

[![Tests + Linting][ci-image]][ci-url] [![License][license-image]][license-url]

[ci-image]: https://github.com/danikaze/eslint-plugin-protected-imports/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/danikaze/eslint-plugin-protected-imports/actions/workflows/ci.yml
[license-image]: https://img.shields.io/github/license/danikaze/eslint-plugin-protected-imports
[license-url]: LICENSE

Provides a way to simulate with linting rules _protected_ visibility of exported
members.

A folder containing an `index.*` file requires importers outside that folder to
use a public entry. Files inside a folder can access its internals, subject to
any nested boundaries. A folder without an entry file adds no boundary of its
own.

## ESLint setup

```sh
npm install --save-dev eslint-plugin-protected-imports
```

```js
// eslint.config.js
import protectedImports from 'eslint-plugin-protected-imports';

export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: { 'protected-imports': protectedImports },
    rules: { 'protected-imports/public-entry': 'error' },
  },
];
```

The `files` pattern selects **importing files** to lint. Keep your project's
existing parser configuration for TypeScript or JSX. The rule works with
static imports (including side-effect and type imports), re-exports, dynamic
`import()`, and bare `require()` calls that use string literals.

For example, from `components/bar/bar.tsx`, `../foo`, `../foo/index`, and
`/components/foo` are public paths when `components/foo/index.ts` exists.
`../foo/use-foo` would violate that boundary. If `foo/internal` also has an
entry, files directly in `foo` must use it to access `internal`. Files outside
`foo` must still go through `foo`'s entry. Direct imports from an ancestor
directory are allowed.

Relative specifiers resolve from the importing file. Leading slash specifiers
are relative to ESLint's working directory. Run ESLint with the desired project
root as its working directory. The rule checks existing local targets, including
extensionless paths for common JavaScript and TypeScript extensions. Bare
package specifiers and TypeScript aliases are outside this version's coverage.

To override the default `index.*` entry pattern, provide an array of filenames
or filename patterns using `*` as a wildcard. Import the entry explicitly when
your runtime or bundler does not map a directory import to that entry.

```js
'protected-imports/public-entry': ['error', { entryFiles: ['public.ts', 'index.*'] }]
```

## Development and release

Run `npm ci`, `npm run lint`, and `npm run test:all`. The latter runs TypeScript
checking and Vitest. Use `npm test` to run Vitest alone. CI checks ESLint 9 and 10
on Node.js 22 and 24.

CI runs on branch pushes, pull requests, and merge queues. In the GitHub branch
ruleset for the default branch, require pull requests and the
`Required CI checks` status check to pass before merging.

Husky runs Prettier on staged files before commit, then runs the project's
typecheck and lint checks when code or configuration changes. Before a push,
it runs the same typecheck and Vitest suite as CI.

Run `npm run build` to compile the TypeScript source and create the npm tarball
and its matching ZIP in `dist/`. Both contain the compiled JavaScript, TypeScript
declarations, and package metadata under `package/`. Pushing a tag such as
`v0.1.0` or `v12.34.56` triggers the release workflow, which builds from the
tagged commit, creates a GitHub release, and attaches the ZIP.
