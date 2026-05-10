export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCardName(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-ES");
}

export function normalizeObservation(value: string | null | undefined): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-ES");
}

/**
 * Normaliza nombres de expansión/set para comparación tolerante.
 * Elimina diacríticos, puntuación (: ' -), colapsa espacios y pasa a minúsculas.
 * Ej: "Commander Legends: Battle for Baldur's Gate" → "commander legends battle for baldurs gate"
 */
export function normalizeSetName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[:\-''".,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}
