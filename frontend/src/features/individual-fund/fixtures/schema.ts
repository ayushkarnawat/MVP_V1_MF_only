// A tiny structural validator. Each schema is typed against a contract type from ../types.ts, so a field that
// is added to or removed from the type without the schema (or the other way round) fails type-checking, and a
// JSON file that does not match fails fixtures.test.ts. It is reused at integration, when the real golden
// fixtures replace the spec fixtures.
export interface Schema<T> {
  check: (value: unknown, path: string) => string[];
  readonly kind?: T;
  /** True for a field the contract allows to be absent (the additive fields of register C124). */
  readonly optional?: boolean;
}

const make = <T>(check: Schema<T>["check"]): Schema<T> => ({ check });
const typeName = (value: unknown) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);

export const str: Schema<string> = make((value, path) => (typeof value === "string" ? [] : [`${path}: expected string, got ${typeName(value)}`]));
export const num: Schema<number> = make((value, path) => (typeof value === "number" ? [] : [`${path}: expected number, got ${typeName(value)}`]));
export const bool: Schema<boolean> = make((value, path) => (typeof value === "boolean" ? [] : [`${path}: expected boolean, got ${typeName(value)}`]));
export const anything: Schema<unknown> = make(() => []);

export function lit<T extends string | number | boolean>(...allowed: T[]): Schema<T> {
  return make((value, path) => (allowed.includes(value as T) ? [] : [`${path}: expected one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`]));
}

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return make((value, path) => (value === null ? [] : inner.check(value, path)));
}

export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return { check: (value, path) => (value === undefined ? [] : inner.check(value, path)), optional: true };
}

export function arr<T>(item: Schema<T>): Schema<T[]> {
  return make((value, path) => {
    if (!Array.isArray(value)) return [`${path}: expected array, got ${typeName(value)}`];
    return value.flatMap((entry, index) => item.check(entry, `${path}[${index}]`));
  });
}

export function obj<T extends object>(fields: { [K in keyof T]-?: Schema<T[K]> }): Schema<T> {
  return make((value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path}: expected object, got ${typeName(value)}`];
    const record = value as Record<string, unknown>;
    const errors: string[] = [];
    const wanted = Object.keys(fields);
    for (const key of wanted) {
      if (!(key in record)) {
        if (!(fields as Record<string, Schema<unknown>>)[key].optional) errors.push(`${path}.${key}: missing`);
      } else errors.push(...(fields as Record<string, Schema<unknown>>)[key].check(record[key], `${path}.${key}`));
    }
    for (const key of Object.keys(record)) if (!wanted.includes(key)) errors.push(`${path}.${key}: not in the contract`);
    return errors;
  });
}

export function either<A, B>(first: Schema<A>, second: Schema<B>): Schema<A | B> {
  return make((value, path) => {
    const a = first.check(value, path);
    if (a.length === 0) return [];
    const b = second.check(value, path);
    return b.length === 0 ? [] : [...a, ...b];
  });
}
