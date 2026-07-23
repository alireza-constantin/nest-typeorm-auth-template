export const CATALOG_LIMITS = Object.freeze({
  productTitle: 200,
  productSummary: 500,
  productDescription: 50_000,
  variantTitle: 200,
  optionName: 100,
  optionValueLabel: 100,
  optionsPerProduct: 5,
  valuesPerOption: 100,
  variantsPerProduct: 500,
  pageSizeDefault: 20,
  pageSizeMaximum: 100,
  slug: 160,
  sku: 100,
});

export type ProductStatus = 'draft' | 'published' | 'archived';
export type VariantStatus = 'active' | 'archived';
export type FulfillmentClassification = 'physical' | 'digital' | 'service';

const CONTROL_CHARACTER = /\p{Cc}/u;
const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const EXECUTABLE_MARKUP =
  /<\s*\/?\s*(?:script|style|iframe|object|embed)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=\s*['"]?\s*javascript\s*:/iu;

export class CatalogRuleError extends Error {
  constructor(
    readonly code:
      'validation' | 'invalid_product_transition' | 'configuration_conflict',
    message: string,
  ) {
    super(message);
  }
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function requireLimit(value: string, limit: number, field: string): void {
  if (codePointLength(value) > limit) {
    throw new CatalogRuleError('validation', `${field} exceeds its limit`);
  }
}

function requireNoControls(value: string, field: string): void {
  if (CONTROL_CHARACTER.test(value)) {
    throw new CatalogRuleError(
      'validation',
      `${field} contains a control character`,
    );
  }
}

/** A deterministic Unicode comparison form, independent of server locale. */
export function canonicalComparison(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function normalizeSlug(
  value: string,
  reservedRoutes: readonly string[] = [],
): string {
  const normalized = canonicalComparison(value);
  if (
    normalized.length === 0 ||
    codePointLength(normalized) > CATALOG_LIMITS.slug ||
    CONTROL_CHARACTER.test(normalized) ||
    !SLUG.test(normalized)
  ) {
    throw new CatalogRuleError('validation', 'slug is invalid');
  }
  if (
    reservedRoutes.some((route) => canonicalComparison(route) === normalized)
  ) {
    throw new CatalogRuleError('validation', 'slug is reserved');
  }
  return normalized;
}

export function normalizeSku(value: string | null | undefined): {
  display: string | null;
  canonical: string | null;
} {
  if (value === null || value === undefined) {
    return { display: null, canonical: null };
  }
  const display = value.trim();
  if (display.length === 0) return { display: null, canonical: null };
  requireLimit(display, CATALOG_LIMITS.sku, 'sku');
  requireNoControls(display, 'sku');
  return { display, canonical: canonicalComparison(display) };
}

export function requiredText(
  value: string,
  limit: number,
  field: string,
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CatalogRuleError('validation', `${field} is required`);
  }
  requireLimit(normalized, limit, field);
  requireNoControls(normalized, field);
  return normalized;
}

export function optionalText(
  value: string | null | undefined,
  limit: number,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  requireLimit(normalized, limit, field);
  requireNoControls(normalized, field);
  return normalized;
}

export function validateProductText(input: {
  title: string;
  summary?: string | null;
  description?: string | null;
}): { title: string; summary: string | null; description: string | null } {
  const values = {
    title: requiredText(input.title, CATALOG_LIMITS.productTitle, 'title'),
    summary: optionalText(
      input.summary,
      CATALOG_LIMITS.productSummary,
      'summary',
    ),
    description: optionalText(
      input.description,
      CATALOG_LIMITS.productDescription,
      'description',
    ),
  };
  for (const [field, value] of Object.entries(values)) {
    if (value !== null && EXECUTABLE_MARKUP.test(value)) {
      throw new CatalogRuleError(
        'validation',
        `${field} contains executable markup`,
      );
    }
  }
  return values;
}

export function assertProductTransition(
  from: ProductStatus,
  to: ProductStatus,
): void {
  const valid =
    (from === 'draft' && (to === 'published' || to === 'archived')) ||
    (from === 'published' && (to === 'draft' || to === 'archived')) ||
    (from === 'archived' && to === 'draft');
  if (!valid) {
    throw new CatalogRuleError(
      'invalid_product_transition',
      `${from} cannot transition to ${to}`,
    );
  }
}

export function assertVariantTransition(
  from: VariantStatus,
  to: VariantStatus,
): void {
  if (from === to) {
    throw new CatalogRuleError(
      'configuration_conflict',
      'variant transition is invalid',
    );
  }
}

export interface OptionShape {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly values: readonly { id: string; label: string; position: number }[];
}

export interface VariantShape {
  readonly id: string;
  readonly status: VariantStatus;
  readonly position: number;
  readonly fulfillmentClassification: FulfillmentClassification;
  readonly selectionValueIds: readonly string[];
}

export function combinationKey(selectionValueIds: readonly string[]): string {
  return [...selectionValueIds].sort().join(':');
}

export function assertConfigurationConsistency(
  options: readonly OptionShape[],
  variants: readonly VariantShape[],
): void {
  if (options.length > CATALOG_LIMITS.optionsPerProduct) {
    throw new CatalogRuleError('validation', 'too many options');
  }
  if (
    variants.length === 0 ||
    variants.length > CATALOG_LIMITS.variantsPerProduct
  ) {
    throw new CatalogRuleError(
      'configuration_conflict',
      'invalid variant count',
    );
  }

  const optionNames = new Set<string>();
  const optionPositions = new Set<number>();
  const valueToOption = new Map<string, string>();
  for (const option of options) {
    const name = canonicalComparison(
      requiredText(option.name, CATALOG_LIMITS.optionName, 'option name'),
    );
    if (
      optionNames.has(name) ||
      optionPositions.has(option.position) ||
      option.position < 0
    ) {
      throw new CatalogRuleError('configuration_conflict', 'duplicate option');
    }
    optionNames.add(name);
    optionPositions.add(option.position);
    if (
      option.values.length === 0 ||
      option.values.length > CATALOG_LIMITS.valuesPerOption
    ) {
      throw new CatalogRuleError(
        'configuration_conflict',
        'invalid option value count',
      );
    }
    const labels = new Set<string>();
    const positions = new Set<number>();
    for (const value of option.values) {
      const label = canonicalComparison(
        requiredText(
          value.label,
          CATALOG_LIMITS.optionValueLabel,
          'option value label',
        ),
      );
      if (
        labels.has(label) ||
        positions.has(value.position) ||
        value.position < 0 ||
        valueToOption.has(value.id)
      ) {
        throw new CatalogRuleError(
          'configuration_conflict',
          'duplicate option value',
        );
      }
      labels.add(label);
      positions.add(value.position);
      valueToOption.set(value.id, option.id);
    }
  }

  const combinations = new Set<string>();
  const variantPositions = new Set<number>();
  for (const variant of variants) {
    if (variant.position < 0 || variantPositions.has(variant.position)) {
      throw new CatalogRuleError(
        'configuration_conflict',
        'duplicate variant position',
      );
    }
    variantPositions.add(variant.position);
    const selectedOptions = variant.selectionValueIds.map((valueId) =>
      valueToOption.get(valueId),
    );
    if (
      new Set(variant.selectionValueIds).size !==
        variant.selectionValueIds.length ||
      selectedOptions.some((option) => !option)
    ) {
      throw new CatalogRuleError(
        'configuration_conflict',
        'invalid variant selection',
      );
    }
    if (options.length === 0) {
      if (variants.length !== 1 || variant.selectionValueIds.length !== 0) {
        throw new CatalogRuleError(
          'configuration_conflict',
          'simple product must have one default variant',
        );
      }
    } else if (
      variant.selectionValueIds.length !== options.length ||
      new Set(selectedOptions).size !== options.length
    ) {
      throw new CatalogRuleError(
        'configuration_conflict',
        'variant selections must be complete',
      );
    }
    const key = combinationKey(variant.selectionValueIds);
    if (combinations.has(key)) {
      throw new CatalogRuleError(
        'configuration_conflict',
        'duplicate variant combination',
      );
    }
    combinations.add(key);
  }
}

export function assertSingleFulfillmentClassification(
  variants: readonly VariantShape[],
): void {
  if (
    new Set(variants.map((variant) => variant.fulfillmentClassification)).size >
    1
  ) {
    throw new CatalogRuleError(
      'configuration_conflict',
      'mixed fulfillment classifications are not supported',
    );
  }
}
