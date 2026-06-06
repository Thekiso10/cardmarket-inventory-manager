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
    const insertCards: CsvCard[] = [];

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
          insertCards.push(card);

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
      }

      if (insertCards.length > 0) {
        this.writeInsertCards(insertCards);
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
    this.writeCars(failedCards, failedPath);
  }

  private writeInsertCards(insertCards: CsvCard[]): void {
    const insertPath = "inserted_cards.csv";
    logger.info(`Guardando ${insertCards.length} cartas insertadas en ${insertPath}`);
    this.writeCars(insertCards, insertPath);
  }

  private writeCars(cardsList: CsvCard[], cardsPath: string) {
    // Solo extraemos las cabeceras del primer elemento para simplificar
    if (cardsPath.length === 0) return;

    const headers = Object.keys(cardsList[0]).join(",");
    const rows = cardsList.map(card => {
      // Escapar comillas si es necesario
      return Object.values(card).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
    });

    const csvContent = [headers, ...rows].join("\n");
    fs.writeFileSync(cardsPath, csvContent, "utf8");
    logger.info(`Archivo ${cardsPath} guardado correctamente.`);
  }
}
