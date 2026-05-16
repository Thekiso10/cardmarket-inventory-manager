import { launchBrowser } from "../browser/launch-browser.js";
import { saveCookies } from "../browser/cookies.js";
import { config } from "../config/env.js";
import { createPrismaClient } from "../db/prisma.js";
import { logger } from "../logger.js";
import { CardmarketOfferRepository } from "../repositories/cardmarket-offer-repository.js";
import { CardmarketScraper } from "../scraper/cardmarket-scraper.js";

export class InventorySyncService {

  async sync(): Promise<void> {
    const { browser, page } = await launchBrowser();
    try {
      const offers = await new CardmarketScraper(page).scrapeAll();
      logger.info("Ofertas extraidas", { total: offers.length });

      if (config.scraper.dryRun) {
        logger.warn("SCRAPER_DRY_RUN=true, no se escribira en la base de datos");
        return;
      }

      const prisma = createPrismaClient();
      try {
        const summary = await new CardmarketOfferRepository(prisma).syncInventory(offers);
        logger.info("Sincronizacion completada", { 
          creadas: summary.created, 
          actualizadas: summary.updated, 
          borradas: summary.deleted 
        });
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await saveCookies(page, config.scraper.cookiesFile);
      await browser.close();
    }
  }
}
