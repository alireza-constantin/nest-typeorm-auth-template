import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

interface BoundaryViolation {
  readonly rule: string;
  readonly file: string;
  readonly detail: string;
}

const importPattern = /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g;

function normalize(path: string): string {
  return path.replaceAll('\\', '/');
}

function resolvedImport(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  return normalize(resolve(dirname(file), specifier));
}

function businessModule(path: string): string | null {
  return normalize(path).match(/\/modules\/([^/]+)(?:\/|$)/)?.[1] ?? null;
}

function importsOf(file: SourceFile) {
  return [...file.source.matchAll(importPattern)].map((match) => ({
    specifier: match[1],
    resolved: resolvedImport(file.path, match[1]),
  }));
}

export function findBoundaryViolations(
  files: readonly SourceFile[],
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const dependencyGraph = new Map<string, Set<string>>();

  for (const file of files) {
    const normalizedFile = normalize(file.path);
    const sourceModule = businessModule(normalizedFile);

    for (const imported of importsOf(file)) {
      const target = imported.resolved;
      if (!target) continue;
      const targetModule = businessModule(target);

      if (
        normalizedFile.includes('/platform/') &&
        target.includes('/modules/')
      ) {
        violations.push({
          rule: 'platform-independence',
          file: normalizedFile,
          detail: imported.specifier,
        });
      }

      if (
        sourceModule === 'authorization' &&
        targetModule === 'identity' &&
        !target.endsWith('/modules/identity')
      ) {
        const isForeignKeyMetadata =
          normalizedFile.endsWith(
            '/modules/authorization/data/identity-user-foreign-key.persistence.ts',
          ) && target.endsWith('/modules/identity/persistence/user.entity');
        if (!isForeignKeyMetadata) {
          violations.push({
            rule: 'authorization-identity-public-contract',
            file: normalizedFile,
            detail: imported.specifier,
          });
        }
      }

      if (
        sourceModule &&
        targetModule &&
        sourceModule !== targetModule &&
        /(?:\/persistence\/|\.entity(?:\.|$)|repository)/i.test(target)
      ) {
        const isForeignKeyMetadata =
          sourceModule === 'authorization' &&
          normalizedFile.endsWith(
            '/modules/authorization/data/identity-user-foreign-key.persistence.ts',
          ) &&
          target.endsWith('/modules/identity/persistence/user.entity');
        if (!isForeignKeyMetadata) {
          violations.push({
            rule: 'cross-module-persistence',
            file: normalizedFile,
            detail: imported.specifier,
          });
        }
      }

      if (
        imported.specifier.includes('typeorm-transaction-context') &&
        !normalizedFile.includes('/platform/database/') &&
        !normalizedFile.includes('/persistence/') &&
        !normalizedFile.includes('/modules/authorization/data/')
      ) {
        violations.push({
          rule: 'transaction-unwrapping-is-infrastructure-only',
          file: normalizedFile,
          detail: imported.specifier,
        });
      }

      if (sourceModule && targetModule && sourceModule !== targetModule) {
        const dependencies =
          dependencyGraph.get(sourceModule) ?? new Set<string>();
        dependencies.add(targetModule);
        dependencyGraph.set(sourceModule, dependencies);
      }
    }

    if (
      normalizedFile.endsWith('/modules/identity/index.ts') ||
      normalizedFile.endsWith('/modules/authorization/index.ts') ||
      normalizedFile.endsWith('/modules/catalog/index.ts')
    ) {
      if (/export\s+\*/.test(file.source)) {
        violations.push({
          rule: 'narrow-public-index',
          file: normalizedFile,
          detail: 'wildcard export',
        });
      }
      if (
        /\b(?:EntityManager|DataSource|Repository|QueryBuilder)\b/.test(
          file.source,
        ) ||
        /\.entity['"]/.test(file.source)
      ) {
        violations.push({
          rule: 'public-index-persistence-leak',
          file: normalizedFile,
          detail: 'persistence implementation export',
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (moduleName: string): boolean => {
    if (visiting.has(moduleName)) return true;
    if (visited.has(moduleName)) return false;
    visiting.add(moduleName);
    for (const dependency of dependencyGraph.get(moduleName) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(moduleName);
    visited.add(moduleName);
    return false;
  };
  for (const moduleName of dependencyGraph.keys()) {
    if (visit(moduleName)) {
      violations.push({
        rule: 'circular-business-dependency',
        file: moduleName,
        detail: 'business-module import cycle',
      });
      break;
    }
  }

  return violations;
}

function TypeScriptFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...TypeScriptFiles(path));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push({ path, source: readFileSync(path, 'utf8') });
    }
  }
  return files;
}

describe('ADR-0003 module boundaries', () => {
  const sourceRoot = resolve(__dirname, '..');

  it('keeps the real source tree within module boundaries', () => {
    expect(findBoundaryViolations(TypeScriptFiles(sourceRoot))).toEqual([]);
    expect(existsSync(resolve(sourceRoot, 'authorization'))).toBe(false);
  });

  it.each([
    {
      rule: 'platform-independence',
      path: resolve(sourceRoot, 'platform/database/bad.ts'),
      source: "import { IdentityModule } from '../../modules/identity';",
    },
    {
      rule: 'authorization-identity-public-contract',
      path: resolve(sourceRoot, 'modules/authorization/staff/bad.ts'),
      source: "import { User } from '../../identity/persistence/user.entity';",
    },
    {
      rule: 'cross-module-persistence',
      path: resolve(sourceRoot, 'modules/catalog/bad.ts'),
      source: "import { User } from '../identity/persistence/user.entity';",
    },
    {
      rule: 'transaction-unwrapping-is-infrastructure-only',
      path: resolve(sourceRoot, 'modules/authorization/staff/bad.ts'),
      source:
        "import { unwrapTypeOrmTransaction } from '../../../platform/database/typeorm-transaction-context';",
    },
  ])('rejects representative $rule imports', ({ rule, path, source }) => {
    expect(findBoundaryViolations([{ path, source }])).toContainEqual(
      expect.objectContaining({ rule }),
    );
  });

  it('rejects circular business-module imports', () => {
    const files = [
      {
        path: resolve(sourceRoot, 'modules/identity/bad.ts'),
        source: "import '../authorization';",
      },
      {
        path: resolve(sourceRoot, 'modules/authorization/bad.ts'),
        source: "import '../identity';",
      },
    ];
    expect(findBoundaryViolations(files)).toContainEqual(
      expect.objectContaining({ rule: 'circular-business-dependency' }),
    );
  });

  it('keeps cross-module foreign-key metadata non-traversable', () => {
    const entityFiles = [
      'authorization-audit-event.entity.ts',
      'staff-profile.entity.ts',
      'staff-role-assignment.entity.ts',
    ].map((name) =>
      readFileSync(
        resolve(sourceRoot, 'modules/authorization/data', name),
        'utf8',
      ),
    );
    for (const source of entityFiles) {
      expect(source).not.toMatch(/cascade:\s*true/);
      expect(source).not.toMatch(/eager:\s*true/);
      expect(source).not.toMatch(/lazy:\s*true/);
      expect(source).not.toMatch(/\b(?:user|actor|assignedByUser)\??:/);
    }
  });

  it('has only the documented persistence-only Identity metadata exception', () => {
    const authorizationRoot = resolve(sourceRoot, 'modules/authorization');
    const imports = TypeScriptFiles(authorizationRoot)
      .flatMap((file) =>
        importsOf(file).map((imported) => ({
          file: normalize(relative(authorizationRoot, file.path)),
          target: imported.resolved,
        })),
      )
      .filter(({ target }) => target?.includes('/modules/identity/'));
    expect(imports).toEqual([
      {
        file: 'data/identity-user-foreign-key.persistence.ts',
        target: normalize(
          resolve(sourceRoot, 'modules/identity/persistence/user.entity'),
        ),
      },
    ]);
  });
});
