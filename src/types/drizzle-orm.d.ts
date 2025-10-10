declare module 'drizzle-orm/pg-core' {
  // Minimal column builder shape used by schema.ts
  export type ColumnBuilder = {
    primaryKey: () => ColumnBuilder;
    notNull: () => ColumnBuilder;
    default: (v: unknown) => ColumnBuilder;
    defaultNow: () => ColumnBuilder;
  };

  export function pgTable<Name extends string = string, Schema extends Record<string, ColumnBuilder> = Record<string, ColumnBuilder>>(name: Name, schema: Schema): Schema & { __tableName?: Name };
  export function text(name: string): ColumnBuilder;
  export function varchar(name: string, opts?: { length?: number }): ColumnBuilder;
  export function timestamp(name: string): ColumnBuilder;
  export function integer(name: string): ColumnBuilder;
  export function serial(name: string): ColumnBuilder;
  const _default: unknown;
  export default _default;
}
