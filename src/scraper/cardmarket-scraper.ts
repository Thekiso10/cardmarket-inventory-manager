import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import type { CardmarketOffer } from "../types/cardmarket-offer.js";
import { delay } from "../utils/time.js";
import { extractOffersFromDocument, mapRawOffer } from "./cardmarket-page-extractor.js";
import { buildPageUrl } from "./url-builder.js";

export class CardmarketScraper {
  constructor(private readonly page: PageLike) {}

  async scrapeAll(): Promise<CardmarketOffer[]> {
    const offers: CardmarketOffer[] = [];
    let pageNumber = config.scraper.startPage;

    while (true) {
      const pageOffers = await this.scrapePage(pageNumber);
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
    }

    return offers;
  }

  private async scrapePage(pageNumber: number) {
    const url = buildPageUrl(config.cardmarket.offersUrl, pageNumber);
    logger.info("Navegando a Cardmarket", { page: pageNumber, url });

    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await this.page.waitForSelector("#UserOffersTable .article-row", { timeout: 120_000 });
    await delay(config.scraper.pageDelayMs);

    const rawResult = await this.page.evaluate(extractOffersFromDocument, config.cardmarket.baseUrl);

    return {
      hasNextPage: rawResult.hasNextPage,
      offers: rawResult.offers.map((offer) => mapRawOffer(offer, pageNumber))
    };
  }
}
