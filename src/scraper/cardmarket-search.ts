import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import type { CsvCard } from "../types/csv-card.js";
import { delay } from "../utils/time.js";
import { normalizeSetName } from "../utils/text.js";

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
        await this.page.waitForSelector('#ProductSearchInput', { timeout: 60_000 });
        
        // Sanitizar el término de búsqueda:
        // Si el nombre tiene coma (ej: "Wilson, Refined Grizzly"), usar solo la parte
        // antes de la coma. Esto evita que al teclear la coma, el autocomplete
        // intercepte el keystroke y provoque una navegación inesperada.
        const searchTerm = this.sanitizeSearchTerm(card.Name);
        logger.info(`Termino de busqueda sanitizado: "${searchTerm}" (original: "${card.Name}")`);

        await this.page.type('#ProductSearchInput', searchTerm);

        // Cardmarket puede destruir el contexto al cambiar /en/ <-> /es/ o al
        // navegar directamente al producto. Sondeamos URL y DOM para tolerarlo.
        const searchOutcome = await this.waitForSearchOutcome(card);
        if (searchOutcome === "product") {
          logger.info("Cardmarket navego directamente a la pagina de la carta");
          return true;
        }

        // Extraer los resultados del DOM
        const results = await this.extractSearchResults();

        logger.info(`Autocomplete devolvio ${results.length} resultados`, {
          results: results.map(r => `${r.name} [${r.expansionSlug}] #${r.collectorNumber}`)
        });

        // Buscar coincidencia por EXPANSION SLUG (del href, siempre en inglés) + COLLECTOR NUMBER
        // El collector number resuelve variantes (V.1), (V.2) y subcolecciones
        // El expansion slug evita falsos positivos entre sets distintos con el mismo collector number
        const csvSetNormalized = normalizeSetName(card["Set name"]);
        const csvSetCodeLower = card["Set code"].toLowerCase();

        const matchIndex = results.findIndex(result => {
          const collectorMatch = result.collectorNumber === card["Collector number"];
          if (!collectorMatch) return false;

          // El slug del href es algo como "Commander-Legends-Battle-for-Baldurs-Gate"
          // Lo normalizamos a "commander legends battle for baldurs gate" para comparar
          // con el CSV "Commander Legends: Battle for Baldur's Gate" → misma normalización
          const slugNormalized = normalizeSetName(result.expansionSlug);
          
          const expansionMatch = slugNormalized === csvSetNormalized
            || slugNormalized.includes(csvSetNormalized)
            || csvSetNormalized.includes(slugNormalized);

          return expansionMatch;
        });

        if (matchIndex === -1) {
          // Fallback: intentar solo por collector number si hay un único resultado con ese número
          const collectorOnlyMatches = results.filter(r => r.collectorNumber === card["Collector number"]);
          if (collectorOnlyMatches.length === 1) {
            const fallbackIndex = results.indexOf(collectorOnlyMatches[0]);
            logger.warn(`No hubo coincidencia por set+collector, pero hay un unico resultado con Collector #${card["Collector number"]}. Usando fallback.`, {
              expansionSlug: collectorOnlyMatches[0].expansionSlug,
              expectedSet: card["Set name"]
            });
            const match = results[fallbackIndex];
            logger.info(`Coincidencia (fallback): ${match.name} en ${match.expansionSlug}`);
            return await this.clickResult(fallbackIndex);
          }

          logger.warn(`No se encontro coincidencia para ${card.Name} (Set: ${card["Set name"]}, Collector #${card["Collector number"]})`, {
            candidatos: results.map(r => `${r.name} [${r.expansionSlug}] #${r.collectorNumber}`)
          });
          return false;
        }

        const match = results[matchIndex];
        logger.info(`Coincidencia encontrada: ${match.name} en ${match.expansionSlug} (Collector #${match.collectorNumber})`);

        // Hacer click en el resultado correcto
        return await this.clickResult(matchIndex);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (await this.recoverAfterPossibleNavigation(card)) {
          logger.info("La busqueda provoco una navegacion al producto; se continua con la carta", {
            card: card.Name,
            url: this.page.url()
          });
          return true;
        }

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

  /**
   * Sanitiza el nombre de la carta para el input de búsqueda.
   * - Si tiene coma, usa solo la parte antes de la coma (ej: "Wilson, Refined Grizzly" → "Wilson")
   *   porque teclear la coma en el autocomplete provoca navegación inesperada.
   * - Si tiene " // " (cartas doble cara), usa solo la primera cara.
   */
  private sanitizeSearchTerm(name: string): string {
    // Primero: cartas doble cara "Sagu Wildling // Roost Seek" → "Sagu Wildling"
    let term = name.split(" // ")[0].trim();
    
    // Segundo: nombres con coma "Wilson, Refined Grizzly" → "Wilson"
    // Solo si la parte antes de la coma tiene al menos 3 caracteres (para evitar términos muy cortos)
    if (term.includes(",")) {
      const beforeComma = term.split(",")[0].trim();
      if (beforeComma.length >= 3) {
        term = beforeComma;
      } else {
        // Si es muy corto, usar la parte después de la coma
        term = term.split(",")[1]?.trim() || term;
      }
    }

    return term;
  }

  private async waitForSearchOutcome(card: CsvCard): Promise<"product" | "autocomplete" | "timeout"> {
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      if (this.isCurrentProductPageForCard(card)) {
        return "product";
      }

      try {
        const hasAutocompleteResults = await this.page.evaluate(() => {
          return document.querySelectorAll('#AutoCompleteResult.show .autocomplete-link[href*="/Products/Singles/"]').length > 0;
        });

        if (hasAutocompleteResults) {
          return "autocomplete";
        }
      } catch (error) {
        if (!this.isExecutionContextDestroyed(error)) {
          throw error;
        }
      }

      await delay(250);
    }

    return "timeout";
  }

  private async recoverAfterPossibleNavigation(card: CsvCard): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if (this.isCurrentProductPageForCard(card)) {
        return true;
      }

      await delay(250);
    }

    return false;
  }

  private isExecutionContextDestroyed(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorMessage.includes("Execution context was destroyed")
      || errorMessage.includes("Cannot find context with specified id")
      || errorMessage.includes("Protocol error");
  }

  private isCurrentProductPageForCard(card: CsvCard): boolean {
    const currentUrl = this.page.url();
    if (!currentUrl.includes("/Magic/Products/Singles/")) return false;

    const csvSetNormalized = normalizeSetName(card["Set name"]);
    const csvNameNormalized = normalizeSetName(this.sanitizeSearchTerm(card.Name));
    const urlParts = currentUrl.split(/[/?#]/).filter(Boolean);
    const singlesIndex = urlParts.indexOf("Singles");
    const expansionSlug = singlesIndex !== -1 ? urlParts[singlesIndex + 1] ?? "" : "";
    const cardSlug = singlesIndex !== -1 ? urlParts[singlesIndex + 2] ?? "" : "";

    const slugSetNormalized = normalizeSetName(decodeURIComponent(expansionSlug));
    const slugNameNormalized = normalizeSetName(decodeURIComponent(cardSlug));

    const expansionMatch = slugSetNormalized === csvSetNormalized
      || slugSetNormalized.includes(csvSetNormalized)
      || csvSetNormalized.includes(slugSetNormalized);
    const nameMatch = slugNameNormalized === csvNameNormalized
      || slugNameNormalized.includes(csvNameNormalized)
      || csvNameNormalized.includes(slugNameNormalized);

    return expansionMatch && nameMatch;
  }

  private async clickResult(index: number): Promise<boolean> {
    const links = await this.page.$$('#AutoCompleteResult .autocomplete-link[href*="/Products/Singles/"]');
    
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
   * Extrae resultados del autocomplete.
   * IMPORTANTE: El aria-label de .expansion-symbol está localizado (ej: español),
   * por lo que NO se usa para matching. En su lugar se extrae el slug del set
   * desde el href del link, que siempre está en inglés.
   * 
   * Ejemplo de href: /es/Magic/Products/Singles/Commander-Legends-Battle-for-Baldurs-Gate/Wilson-Refined-Grizzly
   * → expansionSlug: "Commander-Legends-Battle-for-Baldurs-Gate"
   */
  private async extractSearchResults(): Promise<Array<{name: string, expansionSlug: string, collectorNumber: string}>> {
    return this.page.evaluate(() => {
      const links = document.querySelectorAll('#AutoCompleteResult .autocomplete-link[href*="/Products/Singles/"]');
      const data: Array<{name: string, expansionSlug: string, collectorNumber: string}> = [];
      
      links.forEach((link) => {
        const href = link.getAttribute('href') || "";

        // Extraer el slug del set desde el href
        // Formato: /es/Magic/Products/Singles/{SET-SLUG}/{CARD-SLUG}
        const hrefParts = href.split('/');
        const singlesIndex = hrefParts.indexOf('Singles');
        const expansionSlug = singlesIndex !== -1 && hrefParts[singlesIndex + 1]
          ? hrefParts[singlesIndex + 1]
          : "";

        // Si no tiene slug de expansion, es un link genérico (ej: "Búsqueda Avanzada", "Mostrar todos")
        if (!expansionSlug) return;

        // Obtenemos el nombre de la carta. En algunas respuestas Cardmarket añade
        // clases extra como autocomplete-text o cambia ligeramente el contenedor.
        const nameEl = link.querySelector('.autocomplete-cell.name .text-truncate, .autocomplete-cell.name [class*="text-truncate"], .autocomplete-text .text-truncate');

        // El collector number está en dos formatos según viewport:
        // Desktop: <span class="text-muted small ms-2 d-none d-md-inline">261</span>
        // Mobile:  <div class="text-muted small d-md-none">261</div>  (sin ms-2, es un div)
        const numberDesktop = link.querySelector('.autocomplete-cell.name .text-muted.small.ms-2.d-none.d-md-inline');
        const numberMobile = link.querySelector('.autocomplete-cell.name .text-muted.small.d-md-none');
        const numberEl = numberDesktop || numberMobile || Array.from(link.querySelectorAll('.autocomplete-cell.name .text-muted.small'))
          .find((element) => /^\d+[a-z]?$/i.test(element.textContent?.trim() || ""));

        const cardSlug = hrefParts[singlesIndex + 2] || "";
        const nameFromHref = decodeURIComponent(cardSlug).replace(/-/g, " ").trim();

        data.push({
          name: nameEl?.textContent?.trim() || nameFromHref,
          expansionSlug,
          collectorNumber: numberEl?.textContent?.trim() || ""
        });
      });
      
      return data;
    });
  }
}
