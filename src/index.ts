import { logger } from "./logger.js";
import { InventorySyncService } from "./services/inventory-sync-service.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "sync";
  const service = new InventorySyncService();

  if (command === "sync") {
    await service.sync();
    return;
  }

  if (command === "upload") {
    const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
    if (!fileArg) {
      throw new Error("El comando 'upload' requiere el argumento --file=/ruta/al/csv");
    }
    const filePath = fileArg.split("=")[1];
    
    // Lazy load the service to avoid unnecessary imports if not used
    const { CardUploadService } = await import("./services/card-upload-service.js");
    const uploadService = new CardUploadService();
    await uploadService.uploadCards(filePath);
    return;
  }

  if (command === "update-prices") {
    const { PriceUpdateService } = await import("./services/price-update-service.js");
    const updateService = new PriceUpdateService();
    await updateService.updatePrices();
    return;
  }

  throw new Error(`Comando no soportado: ${command}. Usa "sync", "upload" o "update-prices".`);
}

main().catch((error: unknown) => {
  logger.error("Ejecucion fallida", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exitCode = 1;
});
