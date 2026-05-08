export function parseEuroPriceToCents(value: string): number {
  const normalized = value
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number.parseFloat(normalized);
  if (Number.isNaN(amount)) {
    throw new Error(`No se pudo convertir el precio: "${value}"`);
  }

  return Math.round(amount * 100);
}
