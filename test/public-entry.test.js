import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import plugin from '../src/index.ts';

const ruleId = 'protected-imports/public-entry';
let root;

beforeAll(
  /** Creates the shared on-disk import fixtures. */ () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'protected-imports-'));
    for (const filename of [
      'components/index.ts',
      'components/shared.ts',
      'components/foo/index.ts',
      'components/foo/index.tsx',
      'components/foo/foo.tsx',
      'components/foo/use-foo.tsx',
      'components/foo/unmarked/helper.ts',
      'components/foo/internal/index.ts',
      'components/foo/internal/private.ts',
      'components/bar/index.ts',
      'components/bar/bar.tsx',
      'utils/sum.ts',
      'custom/public.ts',
      'custom/private.ts',
      'collision/with-entry.ts',
      'collision/with-entry/index.ts',
      'collision/with-entry/secret.ts',
    ]) {
      const absolute = path.join(root, filename);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, '');
    }
  }
);

afterAll(
  /** Removes the temporary import fixtures. */ () => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
);

/** Runs the public rule with the supplied options and optional project parser. */
function lint(code, filename = 'components/bar/bar.js', options, parser) {
  const linter = new Linter({ cwd: root });
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.{js,ts}'],
        languageOptions: parser ? { parser } : {},
        plugins: { 'protected-imports': plugin },
        rules: { [ruleId]: options ? ['error', options] : 'error' },
      },
    ],
    { filename: path.join(root, filename) }
  );
  /** Distinguishes rule diagnostics from parser and configuration failures. */
  const isRuleDiagnostic = (message) => message.ruleId === ruleId;
  expect(messages.every(isRuleDiagnostic)).toBe(true);
  return messages;
}

describe(
  'public entry paths',
  /** Registers boundary and path resolution cases. */ () => {
    it.each([
      '../foo',
      '/components/foo',
      '../foo/index',
      '../foo/index.tsx',
      '../foo/index.js',
      '../foo/internal/../index',
      '/components/./foo',
      '../shared',
      '..',
      '../../utils/sum',
      '@/components/foo/foo',
      'some-package',
      '../foo/missing',
    ])(
      'allows %s from bar',
      /** Asserts that an allowed path produces no diagnostic. */ (
        specifier
      ) => {
        expect(lint(`import "${specifier}"`)).toEqual([]);
      }
    );

    it.each([
      '../foo/foo',
      '/components/foo/foo',
      '../foo/use-foo.tsx',
      '../foo/internal/index.ts',
      '../foo/internal',
      '../foo/unmarked/helper',
    ])(
      'reports %s at the outermost crossed boundary',
      /** Verifies the reported folder and message. */ (specifier) => {
        expect(lint(`import "${specifier}"`)).toEqual([
          expect.objectContaining({
            messageId: 'privateImport',
            message: expect.stringContaining("'components/foo'"),
          }),
        ]);
      }
    );

    it(
      'allows internal and ancestor imports, and still enforces nested boundaries',
      /** Checks access from inside a protected folder. */ () => {
        const filename = 'components/foo/foo.js';
        expect(
          lint(
            'import "./use-foo"; import "./internal"; import "../shared";',
            filename
          )
        ).toEqual([]);
        expect(lint('import "./internal/private";', filename)).toEqual([
          expect.objectContaining({
            message: expect.stringContaining("'components/foo/internal'"),
          }),
        ]);
        expect(
          lint('import "../use-foo";', 'components/foo/internal/child.js')
        ).toEqual([]);
      }
    );

    it(
      'checks an ancestor of the target even when the target folder has no entry',
      /** Checks enforcement from outside an enclosing folder. */ () => {
        const [message] = lint('import "/components/foo";', 'outside.js');
        expect(message.message).toContain("'components'");
        expect(lint('import "/components";', 'outside.js')).toEqual([]);
      }
    );

    it(
      'checks the file when an extensionless path also names a directory',
      /** Verifies file precedence for common module extensions. */ () => {
        expect(lint('import "/collision/with-entry";', 'outside.js')).toEqual(
          []
        );
        expect(
          lint('import "/collision/with-entry/secret";', 'outside.js')
        ).toHaveLength(1);
      }
    );

    it(
      'uses configured entries instead of the default',
      /** Checks the behavior of an explicit public filename. */ () => {
        const options = { entryFiles: ['public.ts'] };
        expect(
          lint(
            'import "/custom"; import "/custom/public";',
            'outside.js',
            options
          )
        ).toEqual([]);
        expect(
          lint('import "/custom/private";', 'outside.js', options)
        ).toHaveLength(1);
        expect(
          lint('import "../foo/foo";', 'components/bar/bar.js', options)
        ).toEqual([]);
      }
    );
  }
);

describe(
  'module syntax',
  /** Registers tests for the supported import syntax. */ () => {
    it.each([
      'import { foo } from "../foo/foo";',
      'export { foo } from "../foo/foo";',
      'export * from "../foo/foo";',
      'import("../foo/foo");',
      'require("../foo/foo");',
    ])(
      'checks %s',
      /** Verifies that JavaScript syntax reaches the boundary check. */ (
        code
      ) => {
        expect(lint(code)).toHaveLength(1);
      }
    );

    it.each([
      'import type { Foo } from "../foo/foo";',
      'export type { Foo } from "../foo/foo";',
      'type Foo = import("../foo/foo").Foo;',
      'import Foo = require("../foo/foo");',
    ])(
      'checks TypeScript syntax %s with the configured parser',
      /** Verifies TypeScript syntax using the project parser. */ (code) => {
        expect(
          lint(code, 'components/bar/bar.ts', undefined, tsParser)
        ).toHaveLength(1);
      }
    );

    it(
      'ignores computed specifiers and locally defined require functions',
      /** Checks calls outside the rule's static analysis. */ () => {
        expect(
          lint(
            'import("./" + name); function load(require) { require("../foo/foo"); }'
          )
        ).toEqual([]);
      }
    );
  }
);
