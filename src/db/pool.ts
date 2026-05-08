import pg from "pg";
import { config } from "../config/env.js";

export function createPool(): pg.Pool {
  return new pg.Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false
  });
}
