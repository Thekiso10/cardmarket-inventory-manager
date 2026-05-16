import { launchBrowser } from "../browser/launch-browser.js";
import { saveCookies } from "../browser/cookies.js";
import { config } from "../config/env.js";
import { createPrismaClient } from "../db/prisma.js";
import { logger } from "../logger.js";
import { CardmarketOfferRepository } from "../repositories/cardmarket-offer-repository.js";
import { CardmarketScraper } from "../scraper/cardmarket-scraper.js";
import { CardmarketAuth } from "../scraper/cardmarket-auth.js";
import { CardmarketStockSearch, type StockCard } from "../scraper/cardmarket-stock-search.js";
import { CardmarketPriceEditor, type PriceUpdateResult } from "../scraper/cardmarket-price-editor.js";
import { delay } from "../utils/time.js";

export class PriceUpdateService {
  async updatePrices(): Promise<void> {
    // 1. Sincronizar BD con el stock actual
    logger.info("=== PASO 1: Sincronizando base de datos con stock actual ===");
    await this.syncDatabase();

    // 2. Consultar cartas elegibles
    logger.info("=== PASO 2: Consultando cartas elegibles para actualizacion de precio ===");
    const cards = await this.getEligibleCards();

    if (cards.length === 0) {
      logger.info("No hay cartas elegibles para actualizar. Finalizando.");
      return;
    }

    logger.info(`Se procesaran ${cards.length} cartas para actualizacion de precios`);

    // 3. Abrir navegador y procesar cartas
    logger.info("=== PASO 3: Procesando actualizaciones de precios ===");
    const { browser, page } = await launchBrowser();
    const results: PriceUpdateResult[] = [];

    try {
      // Login
      const auth = new CardmarketAuth(page);
      await auth.login();

      const stockSearch = new CardmarketStockSearch(page);
      const priceEditor = new CardmarketPriceEditor(page);

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        logger.info(`--- Carta ${i + 1}/${cards.length}: ${card.cardName} (${card.collection}) ---`);

        try {
          // Buscar y navegar a la página de la carta
          const found = await stockSearch.searchAndNavigate(card);
          if (!found) {
            results.push({
              cardName: card.cardName,
              oldPriceCents: card.priceCents,
              newPriceCents: card.priceCents,
              updated: false,
              reason: "error",
              error: "Carta no encontrada en el autocomplete"
            });
            continue;
          }

          // Calcular y actualizar precio si es necesario
          const result = await priceEditor.updatePriceIfNeeded(
            card.cardName,
            card.priceCents,
            card.sourceArticleId
          );
          results.push(result);

          // Delay configurable entre cartas
          if (i < cards.length - 1) {
            await delay(config.updatePrice.delayMs);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error procesando ${card.cardName}: ${errorMessage}`);
          results.push({
            cardName: card.cardName,
            oldPriceCents: card.priceCents,
            newPriceCents: card.priceCents,
            updated: false,
            reason: "error",
            error: errorMessage
          });
        }
      }
    } finally {
      await saveCookies(page, config.scraper.cookiesFile);
      await browser.close();
    }

    // 4. Resumen
    this.printSummary(results);
  }

  private async syncDatabase(): Promise<void> {
    const { browser, page } = await launchBrowser();
    try {
      const offers = await new CardmarketScraper(page).scrapeAll();
      logger.info("Ofertas extraidas para sync", { total: offers.length });

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

  private async getEligibleCards(): Promise<StockCard[]> {
    const prisma = createPrismaClient();
    try {
      const repo = new CardmarketOfferRepository(prisma);
      const dbCards = await repo.getCardsForPriceUpdate(
        config.updatePrice.excludedRarities,
        config.updatePrice.minValueCents
      );

      logger.info(`Cartas en BD: ${dbCards.length} (tras filtrar por rareza y precio minimo)`);

      return dbCards.map(card => ({
        cardName: card.card_name,
        collection: card.collection,
        saleUrl: card.sale_url,
        sourceArticleId: card.source_article_id,
        priceCents: card.price_cents,
        isFoil: card.is_foil
      }));
    } finally {
      await prisma.$disconnect();
    }
  }

  private printSummary(results: PriceUpdateResult[]): void {
    const updated = results.filter(r => r.reason === "updated");
    const belowThreshold = results.filter(r => r.reason === "below_threshold");
    const errors = results.filter(r => r.reason === "error");

    logger.info("=== RESUMEN DE ACTUALIZACION DE PRECIOS ===");
    logger.info(`Total procesadas: ${results.length}`);
    logger.info(`Actualizadas: ${updated.length}`);
    logger.info(`Sin cambio significativo: ${belowThreshold.length}`);
    logger.info(`Errores: ${errors.length}`);

    if (updated.length > 0) {
      logger.info("Cartas actualizadas:");
      for (const r of updated) {
        logger.info(`  ${r.cardName}: ${(r.oldPriceCents / 100).toFixed(2)}€ → ${(r.newPriceCents / 100).toFixed(2)}€`);
      }
    }

    if (errors.length > 0) {
      logger.warn("Cartas con errores:");
      for (const r of errors) {
        logger.warn(`  ${r.cardName}: ${r.error}`);
      }
    }
  }
}
