import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { delay } from "../utils/time.js";
import { CardmarketPricing } from "./cardmarket-pricing.js";

export type PriceUpdateResult = {
  cardName: string;
  oldPriceCents: number;
  newPriceCents: number;
  updated: boolean;
  reason: "updated" | "no_change" | "below_threshold" | "error";
  error?: string;
};

/**
 * Edita el precio de una carta del stock del usuario en Cardmarket.
 * 
 * Flujo:
 * 1. Estamos en la página del producto (tras la búsqueda)
 * 2. Calculamos el precio óptimo del mercado
 * 3. Si difiere del actual más del umbral → abrimos el modal de edición
 * 4. Cambiamos el precio y enviamos el formulario AJAX
 */
export class CardmarketPriceEditor {
  private readonly pricing: CardmarketPricing;

  constructor(private readonly page: PageLike) {
    this.pricing = new CardmarketPricing(page);
  }

  async updatePriceIfNeeded(
    cardName: string,
    currentPriceCents: number,
    sourceArticleId: bigint | null
  ): Promise<PriceUpdateResult> {
    try {
      // 1. Calcular el precio óptimo del mercado
      const calculatedPriceStr = await this.pricing.calculatePrice();
      const newPriceCents = Math.round(parseFloat(calculatedPriceStr) * 100);

      // 2. Comprobar si la diferencia justifica una actualización
      const diffCents = Math.abs(newPriceCents - currentPriceCents);
      const minDiffCents = config.updatePrice.minDiffCents;

      if (diffCents < minDiffCents) {
        logger.info(`Precio sin cambios significativos para ${cardName}: actual=${(currentPriceCents / 100).toFixed(2)}€, calculado=${calculatedPriceStr}€ (diff=${diffCents} centimos < minimo=${minDiffCents})`)
        return {
          cardName,
          oldPriceCents: currentPriceCents,
          newPriceCents,
          updated: false,
          reason: "below_threshold"
        };
      }

      logger.info(`Actualizando precio de ${cardName}: ${(currentPriceCents / 100).toFixed(2)}€ → ${calculatedPriceStr}€ (diff=${diffCents} centimos)`);

      // 3. Buscar y abrir el modal de edición del artículo
      if (!sourceArticleId) {
        throw new Error("No se tiene source_article_id para editar el articulo");
      }

      await this.openEditModal(sourceArticleId);

      // 4. Cambiar el precio en el modal
      await this.editPrice(calculatedPriceStr);

      // 5. Enviar el formulario
      await this.submitEditForm(sourceArticleId);

      return {
        cardName,
        oldPriceCents: currentPriceCents,
        newPriceCents,
        updated: true,
        reason: "updated"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error actualizando precio de ${cardName}: ${errorMessage}`);
      return {
        cardName,
        oldPriceCents: currentPriceCents,
        newPriceCents: currentPriceCents,
        updated: false,
        reason: "error",
        error: errorMessage
      };
    }
  }

  /**
   * Abre el modal de edición del artículo.
   * Busca el botón de editar en la fila de stock del usuario.
   * El botón tiene: data-modal="/es/Magic/Modal/Article_EditArticleModal?idArticle={id}"
   */
  private async openEditModal(articleId: bigint): Promise<void> {
    // Buscar el botón de editar por el artículo ID
    const editBtnSelector = `a[data-modal*="idArticle=${articleId}"]`;

    // Primero intentar encontrar el botón directamente en la página
    let editBtn = await this.page.$(editBtnSelector);

    if (!editBtn) {
      // Si no está visible, buscar la fila del stock y el botón dentro
      const stockRowSelector = `#stockRow${articleId}`;
      try {
        await this.page.waitForSelector(stockRowSelector, { timeout: 10_000 });
        editBtn = await this.page.$(editBtnSelector);
      } catch {
        // El stock row podría no existir si la carta no está en nuestro stock en esta página
      }
    }

    if (!editBtn) {
      throw new Error(`No se encontro el boton de edicion para el articulo ${articleId}`);
    }

    // Click en el botón de editar
    await editBtn.click();

    // Esperar a que el modal cargue (es un modal AJAX que se carga dinámicamente)
    await this.page.waitForSelector('.modal-dialog input[name="price"]', { timeout: 15_000, visible: true });
    await delay(500); // Dar tiempo al modal para renderizar completamente
  }

  /**
   * Cambia el precio en el modal de edición.
   * El input tiene: name="price" value="2" pattern="^([0-9]+)?([.,][0-9]{1,2}?)?$"
   */
  private async editPrice(newPrice: string): Promise<void> {
    // Limpiar el input de precio
    await this.page.evaluate(() => {
      const input = document.querySelector('.modal-dialog input[name="price"]') as HTMLInputElement;
      if (input) input.value = '';
    });

    // Escribir el nuevo precio
    await this.page.type('.modal-dialog input[name="price"]', newPrice);

    logger.info(`Precio escrito en el modal: ${newPrice}€`);
  }

  /**
   * Envía el formulario de edición en el modal.
   * El formulario es AJAX (data-ajax-action="Article_EditSingleArticle"),
   * así que no hay navegación de página.
   */
  private async submitEditForm(articleId: bigint): Promise<void> {
    // Click en el botón "Editar artículo"
    await this.page.click('.modal-dialog button[type="submit"]');

    // Esperar a que se procese la petición AJAX
    // El callback es "productPageEditCallback" que actualiza el stock row
    await delay(config.sell.submitDelayMs);

    // Verificar que el modal se ha cerrado (indica éxito)
    const modalStillVisible = await this.page.$('.modal-dialog input[name="price"]');
    if (modalStillVisible) {
      // Comprobar si hay mensajes de error
      const errorMsg = await this.page.$('.modal-dialog .invalid-feedback:not(.d-none)');
      if (errorMsg) {
        throw new Error("Error de validacion en el formulario de edicion");
      }
      // Si el modal sigue visible pero sin errores, podría estar procesando
      await delay(2000);
    }

    logger.info(`Formulario de edicion enviado correctamente para articulo ${articleId}`);

    // Cerrar el modal si sigue abierto (por si acaso)
    try {
      const closeBtn = await this.page.$('.modal-dialog .modal-close, .modal-dialog .btn-close');
      if (closeBtn) {
        await closeBtn.click();
        await delay(500);
      }
    } catch {
      // No pasa nada si el modal ya se cerró
    }
  }
}
