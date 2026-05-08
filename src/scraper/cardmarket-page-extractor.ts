import type { CardmarketOffer, ScrapePageResult } from "../types/cardmarket-offer.js";
import { parseEuroPriceToCents } from "../utils/money.js";

export type RawOffer = Omit<CardmarketOffer, "priceCents" | "priceCurrency" | "sourcePage"> & {
  priceText: string;
};

export function mapRawOffer(raw: RawOffer, sourcePage: number): CardmarketOffer {
  return {
    ...raw,
    priceCents: parseEuroPriceToCents(raw.priceText),
    priceCurrency: "EUR",
    sourcePage
  };
}

export function extractOffersFromDocument(baseUrl: string): Omit<ScrapePageResult, "offers"> & { offers: RawOffer[] } {
  function normalizeBrowserWhitespace(value: string | null | undefined): string {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }

  function getBrowserTooltipText(element: Element | null | undefined): string | null {
    if (!element) {
      return null;
    }

    const value =
      element.getAttribute("aria-label") ??
      element.getAttribute("data-bs-original-title") ??
      element.getAttribute("data-original-title") ??
      element.getAttribute("title") ??
      element.textContent;

    const normalized = normalizeBrowserWhitespace(value);
    return normalized.length > 0 ? normalized : null;
  }

  function isFoilIcon(element: Element): boolean {
    return getBrowserTooltipText(element)?.toLocaleLowerCase("es-ES") === "foil";
  }

  const rows = Array.from(document.querySelectorAll<HTMLElement>("#UserOffersTable .table-body .article-row"));

  const offers = rows.flatMap((row) => {
    const nameAnchor = row.querySelector<HTMLAnchorElement>(".col-seller a[href*='/Products/Singles/']");
    const attributes = row.querySelector<HTMLElement>(".product-attributes");
    const collectionElement = attributes?.querySelector<HTMLElement>(".expansion-symbol");
    const rarityElement = attributes?.querySelector<HTMLElement>("svg[aria-label], svg[data-bs-original-title]");
    const conditionElement = attributes?.querySelector<HTMLElement>(".article-condition");
    const attributeIcons = Array.from(attributes?.querySelectorAll<HTMLElement>(".icon[aria-label], .icon[data-bs-original-title], .icon[data-original-title]") ?? [])
      .filter((element) => !element.classList.contains("expansion-symbol"));
    const languageElement = attributeIcons.find((element) => !element.classList.contains("st_SpecialIcon") && !isFoilIcon(element));
    const foilElement = attributeIcons.find((element) => isFoilIcon(element));
    const observationElement = row.querySelector<HTMLElement>(
      ".product-comments .d-lg-block span, .product-comments [data-bs-original-title], .product-comments [aria-label]"
    );
    const priceElement = row.querySelector<HTMLElement>(".col-offer .price-container .color-primary");
    const quantityElement = row.querySelector<HTMLElement>(".col-offer .amount-container .item-count");

    if (!nameAnchor || !priceElement || !quantityElement) {
      return [];
    }

    const articleId = row.id.match(/\d+/)?.[0] ?? null;

    return [
      {
        cardName: normalizeBrowserWhitespace(nameAnchor.textContent),
        saleUrl: new URL(nameAnchor.getAttribute("href") ?? "", baseUrl).toString(),
        collection: getBrowserTooltipText(collectionElement),
        rarity: getBrowserTooltipText(rarityElement),
        language: getBrowserTooltipText(languageElement),
        condition: getBrowserTooltipText(conditionElement) ?? normalizeBrowserWhitespace(conditionElement?.textContent),
        isFoil: Boolean(foilElement),
        observation: getBrowserTooltipText(observationElement),
        priceText: normalizeBrowserWhitespace(priceElement.textContent),
        quantity: Number.parseInt(normalizeBrowserWhitespace(quantityElement.textContent), 10),
        sourceArticleId: articleId ? Number.parseInt(articleId, 10) : null
      }
    ];
  });

  const nextPageLink = document.querySelector<HTMLAnchorElement>(".pagination a.pagination-control[data-direction='next']:not(.disabled)");

  return {
    offers,
    hasNextPage: Boolean(nextPageLink?.getAttribute("href"))
  };
}
