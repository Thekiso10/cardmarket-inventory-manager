import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";

export class CardmarketPricing {
  constructor(private readonly page: PageLike) {}

  async calculatePrice(): Promise<string> {
    logger.info("Extrayendo ofertas para calcular el precio...");

    // Esperar a que la tabla cargue
    await this.page.waitForSelector('#table .table-body, .article-table .table-body', { timeout: 30_000 });

    const offers = await this.extractOffers();

    if (offers.length === 0) {
      throw new Error("No se encontraron ofertas para calcular el precio");
    }

    // Filtrar idiomas asiaticos:
    // Idiomas a descartar segun su nombre en aria-label / data-original-title del icono
    const excludedLanguages = ["Japanese", "Korean", "S-Chinese", "T-Chinese"];
    
    const validOffers = offers.filter(offer => {
      return !excludedLanguages.includes(offer.language);
    });

    if (validOffers.length === 0) {
      throw new Error("Todas las ofertas fueron filtradas por idioma, no se puede calcular el precio");
    }

    logger.info(`Se usaran ${validOffers.length} ofertas para el calculo (descartadas ${offers.length - validOffers.length} por idioma)`);

    // Calcular media
    const sum = validOffers.reduce((acc, offer) => acc + offer.price, 0);
    const average = sum / validOffers.length;

    // Aplicar descuento
    const priceIncreasePercentage = config.sell.priceIncreasePercentage;
    const finalPrice = average * (1 + (priceIncreasePercentage / 100));

    const minPrice = config.sell.minPrice;
    const safePrice = finalPrice <= minPrice ? minPrice : finalPrice;

    if (finalPrice !== safePrice) {
      logger.info(`El precio calculado (${finalPrice.toFixed(2)}) es menor al mínimo (${minPrice}). Se usará ${safePrice.toFixed(2)}.`);
    }

    // Formatear a string con 2 decimales (ej. "0.05")
    // Se utilizará formato string para que sea insertado en el input
    const formattedPrice = safePrice.toFixed(2);
    
    logger.info(`Calculo de precio: Suma=${sum.toFixed(2)}, Media=${average.toFixed(2)}, Incremento=${priceIncreasePercentage}%, Precio Final=${formattedPrice} €`);

    return formattedPrice;
  }

  private async extractOffers(): Promise<Array<{ language: string, price: number }>> {
    return this.page.evaluate(() => {
      // Camino normal: la mayoria de paginas tienen la tabla principal con id="table".
      // Respaldo: algunas paginas cargan la misma estructura sin ese id.
      const tableRows = Array.from(document.querySelectorAll('#table .article-row'));
      const rows = (tableRows.length > 0
        ? tableRows
        : Array.from(document.querySelectorAll('.article-table .article-row[id^="articleRow"]'))
      ).slice(0, 20);
      const data: Array<{ language: string, price: number }> = [];

      for (const row of rows) {
        // Encontrar el idioma. Está en la columna de producto
        const langIcon = row.querySelector('.col-product .icon[data-original-title], .col-product .icon[aria-label]');
        const language = langIcon ? (langIcon.getAttribute('data-original-title') || langIcon.getAttribute('aria-label') || "") : "";

        // Encontrar el precio.
        // Ojo, hay varios elementos de precio por responsive. Tomamos el que tenga texto.
        const priceEl = row.querySelector('.price-container .color-primary');
        if (priceEl && priceEl.textContent) {
          // El texto suele ser algo como "0,02 €" o "12,50 €"
          const priceText = priceEl.textContent.trim();
          // Convertir "0,02 €" a número 0.02
          const cleanPrice = priceText.replace('€', '').trim().replace(',', '.');
          const priceValue = parseFloat(cleanPrice);

          if (!isNaN(priceValue)) {
            data.push({
              language,
              price: priceValue
            });
          }
        }
      }

      return data;
    });
  }
}
