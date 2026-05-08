import { launchBrowser } from "../browser/launch-browser.js";
import { saveCookies } from "../browser/cookies.js";
import { config } from "../config/env.js";
import { createPool } from "../db/pool.js";
import { logger } from "../logger.js";
import { CardmarketOfferRepository } from "../repositories/cardmarket-offer-repository.js";
import { CardmarketScraper } from "../scraper/cardmarket-scraper.js";

export class InventorySyncService {
  async scrapeOnly(): Promise<void> {
    const { browser, page } = await launchBrowser();
    try {
      const offers = await new CardmarketScraper(page).scrapeAll();
      logger.info("Ofertas extraidas", { total: offers.length });
      console.table(
        offers.slice(0, 20).map((offer) => ({
          nombre: offer.cardName,
          coleccion: offer.collection,
          rareza: offer.rarity,
          idioma: offer.language,
          calidad: offer.condition,
          foil: offer.isFoil ? "Si" : "No",
          observacion: offer.observation,
          precio: `${(offer.priceCents / 100).toFixed(2)} ${offer.priceCurrency}`,
          cantidad: offer.quantity
        }))
      );
    } finally {
      await saveCookies(page, config.scraper.cookiesFile);
      await browser.close();
    }
  }

  async sync(): Promise<void> {
    const { browser, page } = await launchBrowser();
    try {
      const offers = await new CardmarketScraper(page).scrapeAll();
      logger.info("Ofertas extraidas", { total: offers.length });

      if (config.scraper.dryRun) {
        logger.warn("SCRAPER_DRY_RUN=true, no se escribira en la base de datos");
        return;
      }

      const pool = createPool();
      try {
        const summary = await new CardmarketOfferRepository(pool).upsertMany(offers);
        logger.info("Sincronizacion completada", summary);
      } finally {
        await pool.end();
      }
    } finally {
      await saveCookies(page, config.scraper.cookiesFile);
      await browser.close();
    }
  }
}
