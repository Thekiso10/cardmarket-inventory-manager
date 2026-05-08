import { spawn } from "node:child_process";
import "dotenv/config";

const command = process.argv.slice(2);

if (command.length === 0) {
  console.error("Uso: node scripts/run-liquibase.mjs <comando-liquibase>");
  process.exit(1);
}

const requiredEnv = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Faltan variables de entorno: ${missing.join(", ")}`);
  process.exit(1);
}

const args = [
  "--changeLogFile=liquibase/changelog/db.changelog-master.xml",
  `--url=jdbc:postgresql://${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`,
  `--username=${process.env.DB_USER}`,
  `--password=${process.env.DB_PASSWORD}`,
  "--driver=org.postgresql.Driver",
  "--hub-mode=off",
  ...command
];

const child = spawn("liquibase", args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Liquibase finalizado por senal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
