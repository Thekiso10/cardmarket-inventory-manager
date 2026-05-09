import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import type { CsvCard } from "../types/csv-card.js";
import { delay } from "../utils/time.js";

export class CardmarketSell {
  constructor(private readonly page: PageLike) {}

  async listForSale(card: CsvCard, price: string): Promise<void> {
    logger.info(`Navegando a la pestaña de Venta para ${card.Name}...`);

    // Esperar a que los tabs carguen
    await this.page.waitForSelector('.nav-tabs', { timeout: 30_000 });

    // Click en la pestaña 'Sell'
    const sellTab = await this.page.$('a[href="#tabContent-sell"]');
    if (!sellTab) {
      throw new Error("No se encontro la pestaña de venta (Sell)");
    }
    await sellTab.click();

    // Esperar a que el formulario cargue y sea visible
    await this.page.waitForSelector('#ListProductForm', { timeout: 30_000, visible: true });
    
    // Rellenar formulario
    await this.fillQuantity(card.Quantity);
    await this.fillLanguage(card.Language);
    await this.fillCondition(card.Condition);
    await this.fillFoil(card.Foil);
    await this.fillPrice(price);

    // Esperar un momento (configurable) para simular velocidad humana
    await delay(config.sell.submitDelayMs);

    logger.info("Enviando formulario de venta...");

    // Enviar formulario (clic en 'Put for sale')
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120_000 }),
      this.page.click('#ListProductForm input[type="submit"]')
    ]);

    // Verificar si se ha publicado exitosamente. Usualmente hay un flash message de "exito".
    // Aunque a veces redirige o simplemente refresca con un panel verde.
    const successMsg = await this.page.$('.alert-success');
    if (!successMsg) {
      logger.warn("El articulo se envio, pero no se detecto mensaje de exito. Por favor, verificar.");
    } else {
      logger.info(`Carta ${card.Name} puesta a la venta con exito.`);
    }
  }

  private async fillQuantity(qty: string): Promise<void> {
    const amountStr = parseInt(qty, 10).toString();
    if (amountStr !== "NaN") {
      // Input de amount type=number tiene nombre 'amount' o id 'amount-xxx'. El name='amount' es estático.
      await this.page.evaluate(() => {
        const input = document.querySelector('input[name="amount"]') as HTMLInputElement;
        if (input) input.value = '';
      });
      await this.page.type('input[name="amount"]', amountStr);
    }
  }

  private async fillLanguage(lang: string): Promise<void> {
    // Mapeo simple basado en el HTML proporcionado
    const langMap: Record<string, string> = {
      'en': '1', // English
      'fr': '2', // French
      'de': '3', // German
      'es': '4', // Spanish
      'it': '5', // Italian
      'zh-s': '6', // S-Chinese
      'ja': '7', // Japanese
      'pt': '8', // Portuguese
      'ko': '10', // Korean
      'zh-t': '11' // T-Chinese
    };

    const val = langMap[lang.toLowerCase()];
    if (val) {
      await this.page.select('select[name="idLanguage"]', val);
    } else {
      // Por defecto English si no hay mapeo (o dejar el default)
      logger.warn(`Idioma ${lang} no mapeado, usando English por defecto`);
      await this.page.select('select[name="idLanguage"]', '1');
    }
  }

  private async fillCondition(cond: string): Promise<void> {
    // CSV format for condition: "near_mint" (del ejemplo)
    const condMap: Record<string, string> = {
      'mint': '1',
      'near_mint': '2',
      'excellent': '3',
      'good': '4',
      'light_played': '5',
      'played': '6',
      'poor': '7'
    };

    const val = condMap[cond.toLowerCase()];
    if (val) {
      await this.page.select('select[name="idCondition"]', val);
    } else {
      // Default to Near Mint si no es reconocido
      await this.page.select('select[name="idCondition"]', '2');
    }
  }

  private async fillFoil(foil: string): Promise<void> {
    // Si el valor es 'foil', marcamos la casilla
    if (foil.toLowerCase() === 'foil') {
      const isChecked = await this.page.evaluate(() => {
        const checkbox = document.querySelector('input[name="isFoil"]') as HTMLInputElement;
        return checkbox ? checkbox.checked : false;
      });
      
      if (!isChecked) {
        await this.page.click('input[name="isFoil"]');
      }
    }
  }

  private async fillPrice(price: string): Promise<void> {
    // Limpiamos y escribimos
    await this.page.evaluate(() => {
      const input = document.querySelector('input[name="price"]') as HTMLInputElement;
      if (input) input.value = '';
    });
    // El precio debe ir con punto o coma, pero Cardmarket acepta punto. El price format del HTML dice "0.00".
    await this.page.type('input[name="price"]', price);
  }
}
