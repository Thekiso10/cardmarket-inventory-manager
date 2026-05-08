import type { PrismaClient } from "@prisma/client";
import type { CardmarketOffer } from "../types/cardmarket-offer.js";
import { normalizeCardName, normalizeObservation } from "../utils/text.js";

export type UpsertSummary = {
  processed: number;
};

export class CardmarketOfferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertMany(offers: CardmarketOffer[]): Promise<UpsertSummary> {
    const operations = offers.map((offer) => {
      const normalizedCardName = normalizeCardName(offer.cardName);
      const normalizedObservation = normalizeObservation(offer.observation);

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

      return this.prisma.cardmarketOffer.upsert({
        where: {
          normalized_card_name_is_foil_normalized_observation: {
            normalized_card_name: normalizedCardName,
            is_foil: offer.isFoil,
            normalized_observation: normalizedObservation
          }
        },
        create: {
          normalized_card_name: normalizedCardName,
          is_foil: offer.isFoil,
          normalized_observation: normalizedObservation,
          ...data
        },
        update: data
      });
    });

    await this.prisma.$transaction(operations);
    return { processed: offers.length };
  }
}
