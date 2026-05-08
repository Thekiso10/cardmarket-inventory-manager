import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import type { CardmarketOffer } from "../types/cardmarket-offer.js";
import { delay } from "../utils/time.js";
import { type RawOffer, extractOffersFromDocument, mapRawOffer } from "./cardmarket-page-extractor.js";
import { buildPageUrl } from "./url-builder.js";

const NEXT_PAGE_SELECTOR = ".pagination a.pagination-control[data-direction='next']:not(.disabled)";
const TABLE_ROW_SELECTOR = "#UserOffersTable .article-row";

export class CardmarketScraper {
  constructor(private readonly page: PageLike) {}

  async scrapeAll(): Promise<CardmarketOffer[]> {
    const offers: CardmarketOffer[] = [];
    let pageNumber = config.scraper.startPage;
    let isFirstNavigation = true;

    while (true) {
      if (isFirstNavigation) {
        await this.navigateToPage(pageNumber);
        isFirstNavigation = false;
      }

      const pageOffers = await this.extractCurrentPage(pageNumber);
      offers.push(...pageOffers.offers);

      logger.info("Pagina extraida", {
        page: pageNumber,
        offers: pageOffers.offers.length,
        total: offers.length,
        hasNextPage: pageOffers.hasNextPage
      });

      if (!pageOffers.hasNextPage) {
        break;
      }

      pageNumber += 1;
      if (config.scraper.maxPages > 0 && pageNumber >= config.scraper.startPage + config.scraper.maxPages) {
        logger.info("Limite SCRAPER_MAX_PAGES alcanzado", { maxPages: config.scraper.maxPages });
        break;
      }

      await delay(config.scraper.pageDelayMs);
      await this.clickNextPage(pageNumber);
    }

    return offers;
  }

  /**
   * Navega a la URL de una página concreta (solo primera página o reintentos).
   * Incluye lógica de reintentos para superar bloqueos de Cloudflare.
   */
  private async navigateToPage(pageNumber: number): Promise<void> {
    const url = buildPageUrl(config.cardmarket.offersUrl, pageNumber);
    const maxAttempts = config.scraper.retryMaxAttempts;
    const retryDelayMs = config.scraper.retryDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info("Navegando a Cardmarket", { page: pageNumber, url, attempt, maxAttempts });

        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await this.page.waitForSelector(TABLE_ROW_SELECTOR, { timeout: 30_000 });
        await delay(config.scraper.pageDelayMs);

        logger.info("Pagina cargada correctamente", { page: pageNumber, attempt });
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < maxAttempts) {
          logger.warn("Fallo al cargar la pagina, posible bloqueo de Cloudflare. Reintentando...", {
            page: pageNumber,
            attempt,
            maxAttempts,
            retryDelayMs,
            error: errorMessage
          });
          await delay(retryDelayMs);
        } else {
          logger.error("Se agotaron todos los intentos para cargar la pagina", {
            page: pageNumber,
            maxAttempts,
            error: errorMessage
          });
          throw new Error(
            `No se pudo cargar la pagina ${pageNumber} despues de ${maxAttempts} intentos: ${errorMessage}`
          );
        }
      }
    }
  }

  /**
   * Navega a la siguiente página haciendo clic en el botón de paginación.
   * Simula comportamiento humano al usar el botón en lugar de navegar por URL.
   * Incluye lógica de reintentos para superar bloqueos de Cloudflare.
   */
  private async clickNextPage(pageNumber: number): Promise<void> {
    const maxAttempts = config.scraper.retryMaxAttempts;
    const retryDelayMs = config.scraper.retryDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info("Navegando a siguiente pagina via boton de paginacion", {
          page: pageNumber,
          attempt,
          maxAttempts
        });

        const nextButton = await this.page.$(NEXT_PAGE_SELECTOR);
        if (!nextButton) {
          throw new Error("No se encontro el boton de pagina siguiente");
        }

        // Hacer clic y esperar navegación en paralelo para no perder el evento
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120_000 }),
          nextButton.click()
        ]);

        await this.page.waitForSelector(TABLE_ROW_SELECTOR, { timeout: 30_000 });
        await delay(config.scraper.pageDelayMs);

        logger.info("Pagina siguiente cargada correctamente", { page: pageNumber, attempt });
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < maxAttempts) {
          logger.warn("Fallo al navegar a la siguiente pagina, posible bloqueo de Cloudflare. Reintentando...", {
            page: pageNumber,
            attempt,
            maxAttempts,
            retryDelayMs,
            error: errorMessage
          });

          // En reintentos, volvemos a navegar por URL como fallback
          await delay(retryDelayMs);
          try {
            const fallbackUrl = buildPageUrl(config.cardmarket.offersUrl, pageNumber);
            logger.info("Reintentando con navegacion directa por URL", { page: pageNumber, url: fallbackUrl });
            await this.page.goto(fallbackUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
            await this.page.waitForSelector(TABLE_ROW_SELECTOR, { timeout: 30_000 });
            await delay(config.scraper.pageDelayMs);

            logger.info("Pagina cargada correctamente via URL (fallback)", { page: pageNumber, attempt });
            return;
          } catch (fallbackError) {
            const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            logger.warn("Fallback por URL tambien fallo, continuando reintentos...", {
              page: pageNumber,
              attempt,
              error: fallbackMsg
            });
          }
        } else {
          logger.error("Se agotaron todos los intentos para navegar a la siguiente pagina", {
            page: pageNumber,
            maxAttempts,
            error: errorMessage
          });
          throw new Error(
            `No se pudo navegar a la pagina ${pageNumber} despues de ${maxAttempts} intentos: ${errorMessage}`
          );
        }
      }
    }
  }

  /**
   * Extrae las ofertas de la página actualmente cargada en el navegador.
   */
  private async extractCurrentPage(pageNumber: number) {
    // esbuild/tsx inyecta "__name(fn, name)" helpers al compilar; definimos un no-op
    // para que la función serializada funcione dentro del contexto del navegador.
    const fnSource = extractOffersFromDocument.toString();
    const rawResult: { hasNextPage: boolean; offers: RawOffer[] } = await this.page.evaluate(
      `(() => { const __name = (fn) => fn; return (${fnSource})(${JSON.stringify(config.cardmarket.baseUrl)}); })()`
    );

    return {
      hasNextPage: rawResult.hasNextPage,
      offers: rawResult.offers.map((offer) => mapRawOffer(offer, pageNumber))
    };
  }
}
