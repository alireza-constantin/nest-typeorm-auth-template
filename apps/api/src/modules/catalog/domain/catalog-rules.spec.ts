import {
  assertConfigurationConsistency,
  assertProductTransition,
  assertSingleFulfillmentClassification,
  CATALOG_LIMITS,
  CatalogRuleError,
  normalizeSku,
  normalizeSlug,
  validateProductText,
} from './catalog-rules';

describe('Catalog normalization and limits', () => {
  it.each([
    ['Unicode NFKC and lower case', '\uFF26\uFF4F\uFF4F-bar', 'foo-bar'],
    ['Unicode letters', '\u00C9t\u00E9-2026', '\u00E9t\u00E9-2026'],
  ])('normalizes slug: %s', (_name, input, expected) => {
    expect(normalizeSlug(input)).toBe(expected);
  });

  it.each(['foo--bar', '-foo', 'foo-', 'foo/bar', 'foo bar', 'foo?bar'])(
    'rejects invalid slug %s',
    (slug) => expect(() => normalizeSlug(slug)).toThrow(CatalogRuleError),
  );

  it('rejects a normalized reserved route', () => {
    expect(() => normalizeSlug('\uFF23\uFF41\uFF52\uFF54', ['cart'])).toThrow(
      CatalogRuleError,
    );
  });

  it('preserves a trimmed SKU display spelling and canonicalizes comparison', () => {
    expect(normalizeSku('  \uFF33\uFF2B\uFF35-Blue  ')).toEqual({
      display: '\uFF33\uFF2B\uFF35-Blue',
      canonical: 'sku-blue',
    });
    expect(normalizeSku('   ')).toEqual({ display: null, canonical: null });
  });

  it('uses Unicode code points for limits', () => {
    const title = '\u{1F4A1}'.repeat(CATALOG_LIMITS.productTitle);
    expect(validateProductText({ title }).title).toBe(title);
    expect(() => validateProductText({ title: `${title}\u{1F4A1}` })).toThrow(
      CatalogRuleError,
    );
  });

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">unsafe</a>',
  ])('rejects executable Product markup', (description) => {
    expect(() =>
      validateProductText({ title: 'Safe title', description }),
    ).toThrow(CatalogRuleError);
  });
});

describe('Catalog lifecycle and aggregate rules', () => {
  it.each([
    ['draft', 'published'],
    ['published', 'draft'],
    ['published', 'archived'],
    ['archived', 'draft'],
  ] as const)('allows product transition %s -> %s', (from, to) => {
    expect(() => assertProductTransition(from, to)).not.toThrow();
  });

  it.each([
    ['draft', 'draft'],
    ['published', 'published'],
    ['archived', 'published'],
  ] as const)('rejects product transition %s -> %s', (from, to) => {
    expect(() => assertProductTransition(from, to)).toThrow(CatalogRuleError);
  });

  const configurableOptions = [
    {
      id: 'size',
      name: 'Size',
      position: 0,
      values: [
        { id: 'small', label: 'Small', position: 0 },
        { id: 'large', label: 'Large', position: 1 },
      ],
    },
  ];

  it('accepts a simple product only with one unselected default variant', () => {
    expect(() =>
      assertConfigurationConsistency(
        [],
        [
          {
            id: 'default',
            status: 'active',
            position: 0,
            fulfillmentClassification: 'physical',
            selectionValueIds: [],
          },
        ],
      ),
    ).not.toThrow();
    expect(() =>
      assertConfigurationConsistency(
        [],
        [
          {
            id: 'first',
            status: 'active',
            position: 0,
            fulfillmentClassification: 'physical',
            selectionValueIds: [],
          },
          {
            id: 'second',
            status: 'active',
            position: 1,
            fulfillmentClassification: 'physical',
            selectionValueIds: [],
          },
        ],
      ),
    ).toThrow(CatalogRuleError);
  });

  it('requires complete unique configurable selections and one classification', () => {
    const variants = [
      {
        id: 'small',
        status: 'active' as const,
        position: 0,
        fulfillmentClassification: 'physical' as const,
        selectionValueIds: ['small'],
      },
      {
        id: 'large',
        status: 'active' as const,
        position: 1,
        fulfillmentClassification: 'physical' as const,
        selectionValueIds: ['large'],
      },
    ];
    expect(() =>
      assertConfigurationConsistency(configurableOptions, variants),
    ).not.toThrow();
    expect(() =>
      assertConfigurationConsistency(configurableOptions, [
        variants[0],
        { ...variants[1], selectionValueIds: ['small'] },
      ]),
    ).toThrow(CatalogRuleError);
    expect(() =>
      assertConfigurationConsistency(configurableOptions, [
        { ...variants[0], selectionValueIds: [] },
      ]),
    ).toThrow(CatalogRuleError);
    expect(() =>
      assertSingleFulfillmentClassification([
        variants[0],
        { ...variants[1], fulfillmentClassification: 'digital' },
      ]),
    ).toThrow(CatalogRuleError);
  });
});
