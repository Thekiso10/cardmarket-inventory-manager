import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import type { CsvCard } from "../types/csv-card.js";
import { delay } from "../utils/time.js";

export class CardmarketSearch {
  constructor(private readonly page: PageLike) {}

  async searchAndNavigate(card: CsvCard): Promise<boolean> {
    const maxAttempts = config.scraper.retryMaxAttempts;
    const retryDelayMs = config.scraper.retryDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Buscando carta: ${card.Name} (${card["Set name"]}) - Intento ${attempt}`);

        // Ir a inicio para usar el buscador en limpio (y por si hay Cloudflare)
        await this.page.goto(config.cardmarket.baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
        
        // Esperar al input de búsqueda
        await this.page.waitForSelector('#ProductSearchInput', { timeout: 30_000 });
        
        // Escribir el nombre de la carta
        await this.page.type('#ProductSearchInput', card.Name);

        // Esperar a que se muestre la caja de resultados
        await this.page.waitForSelector('#AutoCompleteResult.show', { timeout: 30_000, visible: true });
        // Dar un pequeño tiempo para que termine de cargar los resultados
        await delay(1000);

        // Extraer los resultados del DOM
        const results = await this.extractSearchResults();

        // Buscar coincidencia
        // El collector number es el valor definitivo porque resuelve casos de (V.1), (V.2) o subcolecciones
        const matchIndex = results.findIndex(result => {
          return result.collectorNumber === card["Collector number"];
        });

        if (matchIndex === -1) {
          logger.warn(`No se encontro coincidencia exacta en los resultados para ${card.Name} (Collector #${card["Collector number"]})`);
          return false;
        }

        const match = results[matchIndex];
        logger.info(`Coincidencia encontrada: ${match.name} en ${match.expansion}`);

        // Hacer click en el elemento correspondiente
        // Obtenemos los selectores de los links del autocomplete para clickar el índice correcto
        const links = await this.page.$$('#AutoCompleteResult .autocomplete-link');
        
        if (!links[matchIndex]) {
          throw new Error("No se pudo obtener el elemento DOM de la coincidencia");
        }

        await Promise.all([
          this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120_000 }),
          links[matchIndex].click()
        ]);

        logger.info("Navegacion a la pagina de la carta completada");
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < maxAttempts) {
          logger.warn("Fallo durante la busqueda. Posible bloqueo de Cloudflare o timeout. Reintentando...", {
            attempt,
            maxAttempts,
            retryDelayMs,
            error: errorMessage
          });
          await delay(retryDelayMs);
        } else {
          logger.error("Se agotaron todos los intentos para buscar la carta", {
            card: card.Name,
            maxAttempts,
            error: errorMessage
          });
          return false;
        }
      }
    }
    return false;
  }

  private async extractSearchResults(): Promise<Array<{name: string, expansion: string, collectorNumber: string}>> {
    return this.page.evaluate(() => {
      const links = document.querySelectorAll('#AutoCompleteResult .autocomplete-link');
      const data: Array<{name: string, expansion: string, collectorNumber: string}> = [];
      
      links.forEach((link) => {
        // Obtenemos el nombre y collector number
        const nameEl = link.querySelector('.autocomplete-cell.name .text-truncate');
        // El collector number suele estar en el span.text-muted.small.ms-2
        const numberEl = link.querySelector('.autocomplete-cell.name .text-muted.small.ms-2, .autocomplete-cell.name .text-muted.small.d-md-none');
        
        // Obtenemos el nombre de la coleccion (expansion)
        const expEl = link.querySelector('.expansion-symbol');
        
        if (nameEl && numberEl && expEl) {
          data.push({
            name: nameEl.textContent?.trim() || "",
            expansion: expEl.getAttribute('aria-label') || "",
            collectorNumber: numberEl.textContent?.trim() || ""
          });
        }
      });
      
      return data;
    });
  }
}
