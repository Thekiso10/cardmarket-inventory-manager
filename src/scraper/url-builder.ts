export function buildPageUrl(baseOffersUrl: string, pageNumber: number): string {
  const url = new URL(baseOffersUrl);
  if (pageNumber <= 1) {
    url.searchParams.delete("site");
  } else {
    url.searchParams.set("site", String(pageNumber));
  }
  return url.toString();
}
