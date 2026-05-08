import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .string()
  .default("false")
  .transform((value) => ["true", "1", "yes", "y"].includes(value.toLowerCase()));

const numberFromString = z
  .string()
  .default("0")
  .transform((value, ctx) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Numero invalido: ${value}` });
      return z.NEVER;
    }
    return parsed;
  });

const envSchema = z.object({
  CARDMARKET_OFFERS_URL: z.string().url(),
  CARDMARKET_BASE_URL: z.string().url().default("https://www.cardmarket.com"),
  SCRAPER_HEADLESS: booleanFromString.default("false"),
  SCRAPER_PAGE_DELAY_MS: numberFromString.default("4500"),
  SCRAPER_MAX_PAGES: numberFromString.default("0"),
  SCRAPER_START_PAGE: numberFromString.default("1"),
  SCRAPER_DRY_RUN: booleanFromString.default("true"),
  SCRAPER_COOKIES_FILE: z.string().default(".cardmarket-cookies.json"),
  DATABASE_URL: z.string().url()
});

const parsedEnv = envSchema.parse(process.env);

export const config = {
  cardmarket: {
    offersUrl: parsedEnv.CARDMARKET_OFFERS_URL,
    baseUrl: parsedEnv.CARDMARKET_BASE_URL
  },
  scraper: {
    headless: parsedEnv.SCRAPER_HEADLESS,
    pageDelayMs: parsedEnv.SCRAPER_PAGE_DELAY_MS,
    maxPages: parsedEnv.SCRAPER_MAX_PAGES,
    startPage: parsedEnv.SCRAPER_START_PAGE,
    dryRun: parsedEnv.SCRAPER_DRY_RUN,
    cookiesFile: parsedEnv.SCRAPER_COOKIES_FILE
  },
  db: {
    url: parsedEnv.DATABASE_URL
  }
};
