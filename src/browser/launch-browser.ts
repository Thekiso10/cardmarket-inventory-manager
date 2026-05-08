import { connect } from "puppeteer-real-browser";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import type { BrowserSession, PageLike } from "./browser-session.js";
import { loadCookies } from "./cookies.js";

export async function launchBrowser(): Promise<BrowserSession> {
  logger.info("Iniciando puppeteer-real-browser...");

  const { browser, page } = await connect({
    headless: config.scraper.headless,
    turnstile: true,
    args: ["--window-size=1920,1080"],
    customConfig: {},
    disableXvfb: false,
    ignoreAllFlags: false
  });

  const pageLike = page as unknown as PageLike;
  await pageLike.setViewport({ width: 1920, height: 1080 });
  await loadCookies(pageLike, config.scraper.cookiesFile);

  return {
    browser: browser as unknown as BrowserSession["browser"],
    page: pageLike
  };
}
