/**
 * Schema builders. A schema is the only source of truth for what a filter may contain:
 * the model can choose among the options built from it and nothing else.
 */

export const LIMITS = {
  maxFields: 16,
  maxEnumValues: 100,
  maxEntityCandidates: 20,
} as const;

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export interface FieldBase {
  /** Human-readable name shown in chips and questions. Defaults to the field key. */
  label?: string;
  /** Plain-language meaning, sent to the model. Put business synonyms here ("urgent" etc.). */
  description?: string;
}

export interface EnumField<V extends string = string> extends FieldBase {
  kind: "enum";
  /** Allowed values mapped to an optional description (synonyms, business meaning). */
  values: Readonly<Record<V, string | null>>;
}

export interface BooleanField extends FieldBase {
  kind: "boolean";
}

export interface NumberField extends FieldBase {
  kind: "number";
  /** ISO currency code or unit name ("USD", "INR", "replies"). Mismatched currencies are rejected. */
  unit?: string;
}

export interface DateField extends FieldBase {
  kind: "date";
}

export interface EntityCandidate {
  /** Opaque handle your executor understands. This is what ends up in `filters`. */
  id: string;
  /** Label shown to the user in a chooser. Never sent to the model. */
  label: string;
}

export interface EntityField<Ctx = unknown> extends FieldBase {
  kind: "entity";
  /**
   * Look up records matching a phrase from the request, within what `context` may see.
   * Exactly one candidate binds; zero or several produce a clarification.
   */
  resolve: (phrase: string, context: Ctx) => Promise<EntityCandidate[]> | EntityCandidate[];
  /** Optional re-check at execute time that `id` is still visible to `context`. */
  verify?: (id: string, context: Ctx) => Promise<boolean> | boolean;
}

export type Field<Ctx = any> = EnumField<string> | BooleanField | NumberField | DateField | EntityField<Ctx>;

export type Fields<Ctx = any> = Record<string, Field<Ctx>>;

export interface SearchSchema<F extends Fields = Fields> {
  /** Plural resource name used in questions, e.g. "support tickets". */
  resource: string;
  /** Bump when field meanings change. */
  version: string;
  fields: F;
}

/** Numeric comparison. Every present bound must hold. */
export interface NumberRange {
  eq?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

/** Half-open calendar-date range, `YYYY-MM-DD`, in the request timezone. */
export interface DateRange {
  gte?: string;
  lt?: string;
}

export type FilterValue<F> = F extends EnumField<infer V>
  ? V | { not: V }
  : F extends BooleanField
    ? boolean
    : F extends NumberField
      ? NumberRange
      : F extends DateField
        ? DateRange
        : F extends EntityField<any>
          ? string
          : never;

/** The typed filter object your executor receives. Every key is optional. */
export type Filters<F extends Fields> = { [K in keyof F]?: FilterValue<F[K]> };

export function enumField<const V extends string>(
  values: readonly V[] | Readonly<Record<V, string | null>>,
  options: FieldBase = {},
): EnumField<V> {
  const map = (Array.isArray(values)
    ? Object.fromEntries((values as readonly V[]).map((v) => [v, null]))
    : { ...(values as Record<V, string | null>) }) as Record<V, string | null>;
  const keys = Object.keys(map);
  if (keys.length === 0) throw new TypeError("enumField needs at least one value");
  if (keys.length > LIMITS.maxEnumValues) {
    throw new TypeError(`enumField supports at most ${LIMITS.maxEnumValues} values`);
  }
  for (const k of keys) {
    if (k.trim() === "" || k.length > 100) throw new TypeError(`Invalid enum value: ${JSON.stringify(k)}`);
  }
  return { kind: "enum", values: Object.freeze(map), ...options };
}

export function booleanField(options: FieldBase = {}): BooleanField {
  return { kind: "boolean", ...options };
}

export function numberField(options: FieldBase & { unit?: string } = {}): NumberField {
  return { kind: "number", ...options };
}

export function dateField(options: FieldBase = {}): DateField {
  return { kind: "date", ...options };
}

export function entityField<Ctx = unknown>(
  options: FieldBase & Pick<EntityField<Ctx>, "resolve" | "verify">,
): EntityField<Ctx> {
  if (typeof options.resolve !== "function") throw new TypeError("entityField needs a resolve function");
  return { kind: "entity", ...options };
}

export function defineSearch<const F extends Fields>(schema: {
  resource: string;
  version?: string;
  fields: F;
}): SearchSchema<F> {
  const names = Object.keys(schema.fields);
  if (names.length === 0) throw new TypeError("defineSearch needs at least one field");
  if (names.length > LIMITS.maxFields) throw new TypeError(`defineSearch supports at most ${LIMITS.maxFields} fields`);
  for (const name of names) {
    if (!FIELD_NAME.test(name)) throw new TypeError(`Invalid field name: ${JSON.stringify(name)}`);
  }
  if (names.filter((n) => schema.fields[n]!.kind === "entity").length > 1) {
    throw new TypeError("v0.1 supports at most one entity field per search");
  }
  return Object.freeze({
    resource: schema.resource,
    version: schema.version ?? "1",
    fields: Object.freeze({ ...schema.fields }),
  }) as SearchSchema<F>;
}

export function fieldLabel(name: string, field: Field): string {
  return field.label ?? name;
}
