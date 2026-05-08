import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { logger } from "../logger.js";
import type { PageLike } from "./browser-session.js";

export async function loadCookies(page: PageLike, cookiesFile: string): Promise<void> {
  const path = resolve(cookiesFile);
  if (!existsSync(path)) {
    logger.info("No hay archivo de cookies, se navegara sin sesion persistida", { path });
    return;
  }

  const cookies = JSON.parse(await readFile(path, "utf8"));
  if (Array.isArray(cookies) && cookies.length > 0) {
    await page.setCookie(...cookies);
    logger.info("Cookies cargadas", { count: cookies.length });
  }
}

export async function saveCookies(page: PageLike, cookiesFile: string): Promise<void> {
  const path = resolve(cookiesFile);
  await mkdir(dirname(path), { recursive: true });
  const cookies = await page.cookies();
  await writeFile(path, JSON.stringify(cookies, null, 2), "utf8");
  logger.info("Cookies guardadas", { count: cookies.length });
}
