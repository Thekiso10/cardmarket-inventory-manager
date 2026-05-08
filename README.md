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
npm run liquibase:update
```

## Uso

Extraer ofertas y mostrarlas sin tocar la base de datos:

```bash
npm run scrape
```

Sincronizar con Supabase:

```bash
SCRAPER_DRY_RUN=false npm run sync
```

En PowerShell:

```powershell
$env:SCRAPER_DRY_RUN="false"; npm run sync
```

## Campos sincronizados

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
