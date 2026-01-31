import { SCHEMA_VERSION } from './schemas';

export type Migration<T> = (input: unknown) => T;

export const migrateToCurrent = <T>(input: { version?: number; payload: unknown }, parser: Migration<T>) => {
  const version = input.version ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${version}`);
  }
  if (version === SCHEMA_VERSION) {
    return parser(input.payload);
  }
  // Future: apply migration steps here
  return parser(input.payload);
};
