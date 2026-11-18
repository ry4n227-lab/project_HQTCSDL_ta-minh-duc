// Optional development helper; the app still connects to ordinary PostgreSQL.
import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const url = new URL(process.env.DATABASE_URL || "postgresql://octapoint:octapoint@127.0.0.1:55432/octapoint");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local helper only accepts localhost");
  const dir = resolve(".local/postgres");
  const pg = new EmbeddedPostgres({ databaseDir: dir, port: Number(url.port || 55432), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
  if (!existsSync(resolve(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  const dbName = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error("Invalid local database name");
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName]);
  if (!result.rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}; data kept in .local/postgres. Ctrl+C stops it.`);
  const timer = setInterval(() => {}, 60000);
  const stop = async () => { clearInterval(timer); await pg.stop(); process.exit(0); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
main().catch(e => { console.error("Local PostgreSQL could not start:", e.message); process.exitCode = 1; });
