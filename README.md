# Cardmarket Inventory Manager

Proyecto Node.js 22 para extraer las ofertas publicas de Cardmarket y sincronizarlas con PostgreSQL/Supabase.

## Requisitos

- Node.js 22
- npm
- Liquibase CLI instalado y disponible en el `PATH`
- Acceso a la base PostgreSQL de Supabase

## Instalacion

```bash
npm install
```

## Configuracion

Los secretos viven en `.env`. Usa `.env.example` como plantilla para otros entornos.

Por seguridad el proyecto arranca con `SCRAPER_DRY_RUN=true`, asi puedes probar el scraping sin escribir en Supabase.

## Base de datos

Ejecuta las migraciones:

```bash
npm run db:deploy
```

## Uso

### 1. Extraer ofertas (Scrape)

Extraer ofertas y mostrarlas sin tocar la base de datos:

```bash
npm run scrape
```

### 2. Sincronizar (Sync)

Sincronizar con Supabase:

```bash
SCRAPER_DRY_RUN=false npm run sync
```

En PowerShell:

```powershell
$env:SCRAPER_DRY_RUN="false"; npm run sync
```

### 3. Carga Automática de Cartas (Upload)

Esta funcionalidad permite leer un archivo CSV (formato ManaBox/Scryfall) y poner automáticamente a la venta las cartas en Cardmarket calculando un precio competitivo.

**Configuración requerida en `.env`:**
- `CARDMARKET_USERNAME`: Tu usuario de Cardmarket.
- `CARDMARKET_PASSWORD`: Tu contraseña de Cardmarket.
- `SELL_PRICE_DISCOUNT_PERCENTAGE`: Porcentaje de descuento a aplicar sobre la media de las 20 ofertas más baratas (excluyendo idiomas asiáticos). Ej: `5` para un 5%.
- `SELL_SUBMIT_DELAY_MS`: Tiempo de espera en milisegundos antes de confirmar la venta (ej: `2000`).

**Ejecución:**
```bash
npm run build
node dist/index.js upload --file=/ruta/absoluta/a/tu/archivo.csv
```
*(También puedes usar `npx tsx src/index.ts upload --file=...` en desarrollo)*

El bot iniciará sesión, buscará cada carta, calculará el precio y la añadirá a tu inventario. Las cartas que no se puedan procesar se guardarán en `failed_uploads.csv`.

## Campos sincronizados (Sync)

- Nombre carta
- Link a la venta de la carta
- Coleccion
- Rareza
- Idioma
- Calidad
- Foil
- Observacion
- Precio
- Cantidad
