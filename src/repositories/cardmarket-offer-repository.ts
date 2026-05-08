import type pg from "pg";
import type { CardmarketOffer } from "../types/cardmarket-offer.js";
import { normalizeCardName, normalizeObservation } from "../utils/text.js";

export type UpsertSummary = {
  processed: number;
};

export class CardmarketOfferRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsertMany(offers: CardmarketOffer[]): Promise<UpsertSummary> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const offer of offers) {
        await client.query(
          `
            INSERT INTO cardmarket_offers (
              card_name,
              normalized_card_name,
              is_foil,
              sale_url,
              collection,
              rarity,
              language,
              condition,
              observation,
              normalized_observation,
              price_cents,
              price_currency,
              quantity,
              source_article_id,
              source_page,
              last_seen_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (normalized_card_name, is_foil, normalized_observation)
            DO UPDATE SET
              card_name = EXCLUDED.card_name,
              sale_url = EXCLUDED.sale_url,
              collection = EXCLUDED.collection,
              rarity = EXCLUDED.rarity,
              language = EXCLUDED.language,
              condition = EXCLUDED.condition,
              observation = EXCLUDED.observation,
              normalized_observation = EXCLUDED.normalized_observation,
              price_cents = EXCLUDED.price_cents,
              price_currency = EXCLUDED.price_currency,
              quantity = EXCLUDED.quantity,
              source_article_id = EXCLUDED.source_article_id,
              source_page = EXCLUDED.source_page,
              last_seen_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          `,
          [
            offer.cardName,
            normalizeCardName(offer.cardName),
            offer.isFoil,
            offer.saleUrl,
            offer.collection,
            offer.rarity,
            offer.language,
            offer.condition,
            offer.observation,
            normalizeObservation(offer.observation),
            offer.priceCents,
            offer.priceCurrency,
            offer.quantity,
            offer.sourceArticleId,
            offer.sourcePage
          ]
        );
      }
      await client.query("COMMIT");
      return { processed: offers.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
