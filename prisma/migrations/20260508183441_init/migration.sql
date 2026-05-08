-- CreateTable
CREATE TABLE "cardmarket_offers" (
    "card_name" TEXT NOT NULL,
    "normalized_card_name" TEXT NOT NULL,
    "is_foil" BOOLEAN NOT NULL DEFAULT false,
    "sale_url" TEXT NOT NULL,
    "collection" TEXT,
    "rarity" TEXT,
    "language" TEXT,
    "condition" TEXT,
    "observation" TEXT,
    "normalized_observation" TEXT NOT NULL DEFAULT '',
    "price_cents" INTEGER NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'EUR',
    "quantity" INTEGER NOT NULL,
    "source_article_id" BIGINT,
    "source_page" INTEGER,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cardmarket_offers_pkey" PRIMARY KEY ("normalized_card_name","is_foil","normalized_observation")
);

-- CreateIndex
CREATE INDEX "idx_cardmarket_offers_card_name" ON "cardmarket_offers"("card_name");
