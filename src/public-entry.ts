import type { Rule, Scope } from 'eslint';
import type { Node } from 'estree';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

interface RuleOptions {
  entryFiles?: string[];
}

interface LocalTarget {
  directory: string;
  entry?: string;
}

interface TypeImportNode {
  source?: Node | null;
  argument?: Node & { literal?: Node };
}

const extensions = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.mts',
  '.cjs',
  '.cts',
  '.json',
  '.node',
];
const sourceExtensions = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
]);

/** Tests whether a path is the directory itself or a descendant. */
function isInside(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

/** Resolves project-root and file-relative specifiers to normalized paths. */
function localPath(
  specifier: string,
  importer: string,
  root: string
): string | undefined {
  if (specifier.startsWith('/')) {
    return path.resolve(root, '.' + specifier);
  }
  if (/^\.{1,2}(?:\/|$)/.test(specifier)) {
    return path.resolve(path.dirname(importer), specifier);
  }
}

/** Finds an existing local file or directory using the supported extensions. */
function resolveTarget(filename: string): LocalTarget | undefined {
  const info = statSync(filename, { throwIfNoEntry: false });
  if (info?.isFile()) {
    return {
      directory: path.dirname(filename),
      entry: path.basename(filename),
    };
  }

  const extension = path.extname(filename);
  const substitutions = sourceExtensions.get(extension);
  const stem = substitutions ? filename.slice(0, -extension.length) : filename;
  for (const suffix of substitutions ?? extensions) {
    const candidate = stem + suffix;
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      return {
        directory: path.dirname(candidate),
        entry: path.basename(candidate),
      };
    }
  }
  if (info?.isDirectory()) {
    return { directory: filename };
  }
}

/** Compiles an entry filename pattern with support for the asterisk wildcard. */
function entryMatcher(pattern: string): (name: string) => boolean {
  const escapedParts = [];
  for (const part of pattern.split('*')) {
    escapedParts.push(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  const regex = new RegExp('^' + escapedParts.join('.*') + '$');

  /** Tests whether a filename matches the compiled entry pattern. */
  function matches(name: string): boolean {
    return regex.test(name);
  }

  return matches;
}

const publicEntry: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require external imports to use a folder’s public entry file',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryFiles: {
            type: 'array',
            items: { type: 'string', pattern: '^[^/\\\\]+$' },
            minItems: 1,
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      privateImport:
        "'{{specifier}}' accesses a private module in '{{folder}}'. Use a public entry file ({{entries}}).",
    },
  },

  /** Creates the module visitors and a per-importer cache of public entries. */
  create(context): Rule.RuleListener {
    const root = context.cwd;
    const importer = context.physicalFilename;
    if (!path.isAbsolute(importer) || !isInside(root, importer)) {
      return {};
    }

    const options = context.options[0] as RuleOptions | undefined;
    const matches = (options?.entryFiles ?? ['index.*']).map(entryMatcher);
    const entriesByDirectory = new Map<string, string[]>();

    /** Lists and caches the matching public entry files in a directory. */
    function entriesFor(directory: string): string[] {
      const cached = entriesByDirectory.get(directory);
      if (cached) {
        return cached;
      }

      const entries: string[] = [];
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        /** Tests the current filename against an entry pattern. */
        const matchesEntry = (match: (name: string) => boolean): boolean =>
          match(item.name);
        if (
          matches.some(matchesEntry) &&
          (item.isFile() ||
            (item.isSymbolicLink() &&
              statSync(path.join(directory, item.name), {
                throwIfNoEntry: false,
              })?.isFile()))
        ) {
          entries.push(item.name);
        }
      }
      entries.sort();
      entriesByDirectory.set(directory, entries);
      return entries;
    }

    /** Reports the first crossed boundary that the string specifier violates. */
    function check(source: Node | null | undefined): void {
      if (source?.type !== 'Literal' || typeof source.value !== 'string') {
        return;
      }

      const filename = localPath(source.value, importer, root);
      if (!filename || !isInside(root, filename)) {
        return;
      }

      const target = resolveTarget(filename);
      if (!target) {
        return;
      }

      // Walk from the outermost crossed boundary to the destination so the
      // diagnostic names the public entry the importer can actually access.
      const directories = [];
      for (
        let directory = target.directory;
        !isInside(directory, importer);
        directory = path.dirname(directory)
      ) {
        directories.unshift(directory);
      }
      for (const directory of directories) {
        const entries = entriesFor(directory);
        const usesEntry =
          directory === target.directory &&
          (target.entry === undefined || entries.includes(target.entry));
        if (entries.length > 0 && !usesEntry) {
          context.report({
            node: source,
            messageId: 'privateImport',
            data: {
              specifier: source.value,
              folder: path.relative(root, directory).split(path.sep).join('/'),
              entries: entries.join(', '),
            },
          });
          return;
        }
      }
    }

    /** Checks the source shared by static imports, re-exports, and dynamic imports. */
    function checkModuleSource(node: { source?: Node | null }): void {
      check(node.source);
    }

    return {
      ImportDeclaration: checkModuleSource,
      ExportNamedDeclaration: checkModuleSource,
      ExportAllDeclaration: checkModuleSource,
      ImportExpression: checkModuleSource,
      /** Checks TypeScript import types across parser versions. */
      TSImportType(node: Rule.Node) {
        const typeImport = node as unknown as TypeImportNode;
        if (typeImport.source) {
          check(typeImport.source);
        } else {
          const argument = typeImport.argument;
          check(argument?.literal ?? argument);
        }
      },
      /** Checks the module reference in TypeScript's import-equals syntax. */
      TSExternalModuleReference(node: Rule.Node) {
        check((node as unknown as { expression: Node }).expression);
      },
      /** Checks CommonJS require calls whose binding is global or implicit. */
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require'
        ) {
          for (
            let scope: Scope.Scope | null = context.sourceCode.getScope(node);
            scope;
            scope = scope.upper
          ) {
            const binding = scope.set.get('require');
            if (binding) {
              if (binding.defs.length > 0) {
                return;
              }
              break;
            }
          }
          check(node.arguments[0]);
        }
      },
    };
  },
};

export default publicEntry;
