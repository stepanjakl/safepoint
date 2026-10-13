/*
  A CEL object type needs a constructor the library can name. One class per
  type name, made once: the definitions engine registers its record and lookup
  types with these (formulas.ts).
*/
const ctors = new Map<string, new (fields: object) => object>();

export function ctorFor(typeName: string) {
  let ctor = ctors.get(typeName);
  if (!ctor) {
    ctor = class {
      constructor(fields: object) {
        Object.assign(this, fields);
      }
    };
    Object.defineProperty(ctor, 'name', { value: typeName });
    ctors.set(typeName, ctor);
  }
  return ctor;
}
