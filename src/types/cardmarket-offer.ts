export type CardmarketOffer = {
  cardName: string;
  saleUrl: string;
  collection: string | null;
  rarity: string | null;
  language: string | null;
  condition: string | null;
  isFoil: boolean;
  observation: string | null;
  priceCents: number;
  priceCurrency: "EUR";
  quantity: number;
  sourceArticleId: number | null;
  sourcePage: number;
};

export type ScrapePageResult = {
  offers: CardmarketOffer[];
  hasNextPage: boolean;
};
