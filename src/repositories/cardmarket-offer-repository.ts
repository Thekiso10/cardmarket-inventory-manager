import fs from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import type { CardmarketOffer } from "../types/cardmarket-offer.js";
import { normalizeCardName, normalizeObservation } from "../utils/text.js";

export type SyncSummary = {
  created: number;
  updated: number;
  deleted: number;
};

export class CardmarketOfferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async syncInventory(offers: CardmarketOffer[]): Promise<SyncSummary> {
    const existingRecords = await this.prisma.cardmarketOffer.findMany({
      select: {
        card_name: true,
        normalized_card_name: true,
        is_foil: true,
        normalized_observation: true,
      }
    });

    const existingKeys = new Set(
      existingRecords.map(r => `${r.normalized_card_name}|${r.is_foil}|${r.normalized_observation}`)
    );

    const auditLog = {
      timestamp: new Date().toISOString(),
      created: [] as any[],
      updated: [] as any[],
      deleted: [] as any[],
    };

    // Usaremos un array de promesas de transaccion (o await serial) porque Prisma soporta hasta ciertas operaciones
    // pero $transaction maneja arrays de PrismaPromises perfectamente.
    const operations: any[] = [];
    const scrapedKeys = new Set<string>();

    for (const offer of offers) {
      const normalizedCardName = normalizeCardName(offer.cardName);
      const normalizedObservation = normalizeObservation(offer.observation);
      const key = `${normalizedCardName}|${offer.isFoil}|${normalizedObservation}`;
      scrapedKeys.add(key);

      const data = {
        card_name: offer.cardName,
        sale_url: offer.saleUrl,
        collection: offer.collection,
        rarity: offer.rarity,
        language: offer.language,
        condition: offer.condition,
        observation: offer.observation,
        price_cents: offer.priceCents,
        price_currency: offer.priceCurrency,
        quantity: offer.quantity,
        source_article_id: offer.sourceArticleId,
        source_page: offer.sourcePage,
        last_seen_at: new Date()
      };

      if (existingKeys.has(key)) {
        auditLog.updated.push({ key, name: offer.cardName, price: offer.priceCents });
        operations.push(
          this.prisma.cardmarketOffer.update({
            where: {
              normalized_card_name_is_foil_normalized_observation: {
                normalized_card_name: normalizedCardName,
                is_foil: offer.isFoil,
                normalized_observation: normalizedObservation
              }
            },
            data
          })
        );
      } else {
        auditLog.created.push({ key, name: offer.cardName, price: offer.priceCents });
        operations.push(
          this.prisma.cardmarketOffer.create({
            data: {
              normalized_card_name: normalizedCardName,
              is_foil: offer.isFoil,
              normalized_observation: normalizedObservation,
              ...data
            }
          })
        );
      }
    }

    for (const r of existingRecords) {
      const key = `${r.normalized_card_name}|${r.is_foil}|${r.normalized_observation}`;
      if (!scrapedKeys.has(key)) {
        auditLog.deleted.push({ key, name: r.card_name });
        operations.push(
          this.prisma.cardmarketOffer.delete({
            where: {
              normalized_card_name_is_foil_normalized_observation: {
                normalized_card_name: r.normalized_card_name,
                is_foil: r.is_foil,
                normalized_observation: r.normalized_observation
              }
            }
          })
        );
      }
    }

    await fs.writeFile("audit-log.json", JSON.stringify(auditLog, null, 2), "utf-8");

    if (operations.length > 0) {
      await this.prisma.$transaction(operations, {
        maxWait: 15000, // default: 2000
        timeout: 120000, // default: 5000 (120s para transacciones muy largas)
      });
    }

    return {
      created: auditLog.created.length,
      updated: auditLog.updated.length,
      deleted: auditLog.deleted.length
    };
  }

  /**
   * Obtiene las cartas elegibles para actualización de precio.
   * Se excluyen únicamente las cartas que cumplen ambas condiciones:
   * 1. Su rareza está en la lista de excluidas (ej: Common/Común).
   * 2. Su precio es igual o inferior al umbral mínimo.
   * Por tanto, las cartas raras siempre se incluyen, y las comunes caras también.
   */
  async getCardsForPriceUpdate(
    excludedRarities: string[],
    minPriceCents: number
  ) {
    const allCards = await this.prisma.cardmarketOffer.findMany({
      where: {
        NOT: {
          AND: [
            { rarity: { in: excludedRarities } },
            { price_cents: { lte: minPriceCents } }
          ]
        }
      }
    });

    return allCards;
  }
}
