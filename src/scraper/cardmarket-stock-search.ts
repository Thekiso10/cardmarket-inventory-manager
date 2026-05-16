import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { delay } from "../utils/time.js";
import { normalizeSetName } from "../utils/text.js";

export type StockCard = {
  cardName: string;
  collection: string | null;
  saleUrl: string;
  sourceArticleId: bigint | null;
  priceCents: number;
  isFoil: boolean;
};

/**
 * Busca cartas en Cardmarket usando la página en ESPAÑOL.
 * Recibe datos de la BD (nombres y colecciones ya en español)
 * y hace matching por nombre de colección normalizado.
 */
export class CardmarketStockSearch {
  constructor(private readonly page: PageLike) {}

  async searchAndNavigate(card: StockCard): Promise<boolean> {
    const maxAttempts = config.scraper.retryMaxAttempts;
    const retryDelayMs = config.scraper.retryDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Buscando carta: ${card.cardName} (${card.collection}) - Intento ${attempt}`);

        // Navegar a la página española de Magic
        await this.page.goto(`${config.cardmarket.baseUrl}/es/Magic`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000
        });

        await this.page.waitForSelector('#ProductSearchInput', { timeout: 30_000 });

        // Sanitizar el término de búsqueda
        const searchTerm = this.sanitizeSearchTerm(card.cardName);
        logger.info(`Termino de busqueda: "${searchTerm}" (original: "${card.cardName}")`);

        await this.page.type('#ProductSearchInput', searchTerm);

        // Esperar autocomplete
        await this.page.waitForSelector('#AutoCompleteResult.show', { timeout: 30_000, visible: true });
        await delay(1500);

        // Extraer resultados
        const results = await this.extractSearchResults();

        logger.info(`Autocomplete devolvio ${results.length} resultados`, {
          results: results.map(r => `${r.name} [${r.collectionLabel}] slug:${r.expansionSlug}`)
        });

        // Matching por colección española (aria-label) normalizada
        const dbCollectionNormalized = card.collection ? normalizeSetName(card.collection) : "";

        // También extraer el slug de la sale_url de la BD para matching de respaldo
        const dbSlug = this.extractSlugFromUrl(card.saleUrl);
        const dbSlugNormalized = dbSlug ? normalizeSetName(dbSlug) : "";

        const matchIndex = results.findIndex(result => {
          // Comparar por nombre de colección en español (aria-label vs DB collection)
          const resultCollectionNormalized = normalizeSetName(result.collectionLabel);

          const collectionMatch = dbCollectionNormalized !== "" && (
            resultCollectionNormalized === dbCollectionNormalized
            || resultCollectionNormalized.includes(dbCollectionNormalized)
            || dbCollectionNormalized.includes(resultCollectionNormalized)
          );

          // Fallback: comparar por slug de la URL (siempre en inglés)
          const slugMatch = dbSlugNormalized !== "" && (
            normalizeSetName(result.expansionSlug) === dbSlugNormalized
          );

          return collectionMatch || slugMatch;
        });

        if (matchIndex === -1) {
          // Fallback: si solo hay 1 resultado con link a Singles, usarlo
          const singlesResults = results.filter(r => r.expansionSlug !== "");
          if (singlesResults.length === 1) {
            const fallbackIndex = results.indexOf(singlesResults[0]);
            logger.warn(`No hubo coincidencia por coleccion, pero hay un unico resultado. Usando fallback.`, {
              collection: singlesResults[0].collectionLabel,
              expectedCollection: card.collection
            });
            return await this.clickResult(fallbackIndex);
          }

          logger.warn(`No se encontro coincidencia para ${card.cardName} (Coleccion: ${card.collection})`, {
            candidatos: results.map(r => `${r.name} [${r.collectionLabel}]`)
          });
          return false;
        }

        const match = results[matchIndex];
        logger.info(`Coincidencia encontrada: ${match.name} en ${match.collectionLabel}`);

        return await this.clickResult(matchIndex);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < maxAttempts) {
          logger.warn("Fallo durante la busqueda. Reintentando...", {
            attempt, maxAttempts, retryDelayMs, error: errorMessage
          });
          await delay(retryDelayMs);
        } else {
          logger.error("Se agotaron todos los intentos para buscar la carta", {
            card: card.cardName, maxAttempts, error: errorMessage
          });
          return false;
        }
      }
    }
    return false;
  }

  /**
   * Sanitiza el nombre para el input de búsqueda.
   * Corta antes de comas y " // " para evitar problemas con el autocomplete.
   */
  private sanitizeSearchTerm(name: string): string {
    let term = name.split(" // ")[0].trim();

    if (term.includes(",")) {
      const beforeComma = term.split(",")[0].trim();
      if (beforeComma.length >= 3) {
        term = beforeComma;
      } else {
        term = term.split(",")[1]?.trim() || term;
      }
    }

    return term;
  }

  /**
   * Extrae el slug de expansión de una sale_url.
   * Ej: "https://www.cardmarket.com/es/Magic/Products/Singles/Tarkir-Dragonstorm/Frostcliff-Siege"
   * → "Tarkir-Dragonstorm"
   */
  private extractSlugFromUrl(url: string): string {
    try {
      const parts = new URL(url).pathname.split('/');
      const singlesIndex = parts.indexOf('Singles');
      return singlesIndex !== -1 && parts[singlesIndex + 1] ? parts[singlesIndex + 1] : "";
    } catch {
      return "";
    }
  }

  private async clickResult(index: number): Promise<boolean> {
    const links = await this.page.$$('#AutoCompleteResult .autocomplete-link');

    if (!links[index]) {
      throw new Error("No se pudo obtener el elemento DOM de la coincidencia");
    }

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120_000 }),
      links[index].click()
    ]);

    logger.info("Navegacion a la pagina de la carta completada");
    return true;
  }

  /**
   * Extrae resultados del autocomplete en la página ESPAÑOLA.
   * Usa aria-label (español) para la colección y href slug (inglés) como respaldo.
   * 
   * Estructura del HTML español:
   * - Nombre español: .autocomplete-cell.name .text-truncate (primera)
   * - Colección: .expansion-symbol aria-label (en español)
   * - Slug: del href /es/Magic/Products/Singles/{SLUG}/{CARD}
   */
  private async extractSearchResults(): Promise<Array<{
    name: string;
    collectionLabel: string;
    expansionSlug: string;
  }>> {
    return this.page.evaluate(() => {
      const links = document.querySelectorAll('#AutoCompleteResult .autocomplete-link');
      const data: Array<{ name: string; collectionLabel: string; expansionSlug: string }> = [];

      links.forEach((link) => {
        const href = link.getAttribute('href') || "";

        // Extraer slug del href
        const hrefParts = href.split('/');
        const singlesIndex = hrefParts.indexOf('Singles');
        const expansionSlug = singlesIndex !== -1 && hrefParts[singlesIndex + 1]
          ? hrefParts[singlesIndex + 1]
          : "";

        // Si no tiene slug, es un link genérico (Búsqueda Avanzada, Mostrar todos)
        if (!expansionSlug) return;

        // Nombre de la carta (español)
        const nameEl = link.querySelector('.autocomplete-cell.name .text-truncate');

        // Colección en español (aria-label del icono de expansión)
        const expEl = link.querySelector('.expansion-symbol');
        const collectionLabel = expEl?.getAttribute('aria-label') || "";

        if (nameEl) {
          data.push({
            name: nameEl.textContent?.trim() || "",
            collectionLabel,
            expansionSlug
          });
        }
      });

      return data;
    });
  }
}
