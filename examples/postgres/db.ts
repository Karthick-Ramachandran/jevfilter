import pg from "pg";

/** The app's connection: the read-only role. Local development default if DATABASE_URL is unset. */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://orderdesk_reader:reader_dev_only@127.0.0.1:55432/orderdesk";

export function readOnlyPool(): pg.Pool {
  return new pg.Pool({ connectionString: DATABASE_URL, max: 4, application_name: "jevfilter-orderdesk" });
}
