import { logger } from "./logger.js";
import { InventorySyncService } from "./services/inventory-sync-service.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "sync";
  const service = new InventorySyncService();

  if (command === "scrape") {
    await service.scrapeOnly();
    return;
  }

  if (command === "sync") {
    await service.sync();
    return;
  }

  throw new Error(`Comando no soportado: ${command}. Usa "scrape" o "sync".`);
}

main().catch((error: unknown) => {
  logger.error("Ejecucion fallida", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exitCode = 1;
});
