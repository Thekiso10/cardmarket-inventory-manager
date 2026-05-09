import fs from "fs";
import { parse } from "csv-parse";
import { launchBrowser } from "../browser/launch-browser.js";
import { logger } from "../logger.js";
import type { CsvCard } from "../types/csv-card.js";
import { CardmarketAuth } from "../scraper/cardmarket-auth.js";
import { CardmarketSearch } from "../scraper/cardmarket-search.js";
import { CardmarketPricing } from "../scraper/cardmarket-pricing.js";
import { CardmarketSell } from "../scraper/cardmarket-sell.js";

export class CardUploadService {
  async uploadCards(csvFilePath: string): Promise<void> {
    logger.info(`Iniciando subida de cartas desde: ${csvFilePath}`);

    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`El archivo CSV no existe en la ruta especificada: ${csvFilePath}`);
    }

    const cards = await this.parseCsv(csvFilePath);
    logger.info(`Se han cargado ${cards.length} cartas del CSV`);

    if (cards.length === 0) {
      logger.info("No hay cartas para procesar. Finalizando.");
      return;
    }

    const { browser, page } = await launchBrowser();
    const failedCards: CsvCard[] = [];

    try {
      // 1. Autenticacion
      const auth = new CardmarketAuth(page);
      await auth.login();

      const searchModule = new CardmarketSearch(page);
      const pricingModule = new CardmarketPricing(page);
      const sellModule = new CardmarketSell(page);

      // 2. Procesar cartas secuencialmente
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        logger.info(`--- Procesando carta ${i + 1}/${cards.length}: ${card.Name} ---`);

        try {
          const found = await searchModule.searchAndNavigate(card);
          if (!found) {
            failedCards.push(card);
            continue;
          }

          const calculatedPrice = await pricingModule.calculatePrice();
          await sellModule.listForSale(card, calculatedPrice);

        } catch (error) {
          logger.error(`Error procesando la carta ${card.Name}: ${error instanceof Error ? error.message : String(error)}`);
          failedCards.push(card);
        }
      }

    } finally {
      logger.info("Cerrando navegador...");
      await browser.close();

      if (failedCards.length > 0) {
        this.writeFailedCards(failedCards);
      } else {
        logger.info("Proceso completado con exito. Todas las cartas fueron publicadas.");
      }
    }
  }

  private async parseCsv(filePath: string): Promise<CsvCard[]> {
    return new Promise((resolve, reject) => {
      const records: CsvCard[] = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      fs.createReadStream(filePath)
        .pipe(parser)
        .on("data", (record: CsvCard) => {
          records.push(record);
        })
        .on("end", () => {
          resolve(records);
        })
        .on("error", (error) => {
          reject(error);
        });
    });
  }

  private writeFailedCards(failedCards: CsvCard[]): void {
    const failedPath = "failed_uploads.csv";
    logger.warn(`Guardando ${failedCards.length} cartas fallidas en ${failedPath}`);

    // Solo extraemos las cabeceras del primer elemento para simplificar
    if (failedCards.length === 0) return;
    
    const headers = Object.keys(failedCards[0]).join(",");
    const rows = failedCards.map(card => {
      // Escapar comillas si es necesario
      return Object.values(card).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
    });

    const csvContent = [headers, ...rows].join("\n");
    fs.writeFileSync(failedPath, csvContent, "utf8");
    logger.info(`Archivo ${failedPath} guardado correctamente.`);
  }
}
