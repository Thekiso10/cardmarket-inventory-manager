import type { PageLike } from "../browser/browser-session.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { delay } from "../utils/time.js";

export class CardmarketAuth {
  constructor(private readonly page: PageLike) {}

  async login(): Promise<void> {
    const loginUrl = `${config.cardmarket.baseUrl}/en/Magic/Login`;
    const maxAttempts = config.scraper.retryMaxAttempts;
    const retryDelayMs = config.scraper.retryDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info("Navegando a la pagina de login de Cardmarket", { attempt, maxAttempts });

        await this.page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

        // Comprobar si ya estamos logueados (buscando un elemento que solo sale logueado, e.g. .account-btn o similar)
        // O simplemente buscar los inputs de login. Si no están, quizás ya estamos logueados o nos bloqueó Cloudflare.
        
        try {
          await this.page.waitForSelector('input[name="username"]', { timeout: 15_000 });
        } catch (e) {
          logger.info("No se encontro el input de username, comprobando si ya hay sesion o bloqueo...");
          // Si no encontramos el input de username, verificamos si existe el dropdown de usuario
          const isLogged = await this.page.$('a[href*="/Users/"] .fonticon-user');
          if (isLogged) {
            logger.info("Sesion activa detectada, saltando login.");
            return;
          }
          throw new Error("No se pudo cargar la pagina de login correctamente (posible bloqueo Cloudflare)");
        }

        logger.info("Introduciendo credenciales");
        await this.page.type('input[name="username"]', config.cardmarket.username!);
        await delay(500); // Simulando humano
        await this.page.type('input[name="userPassword"]', config.cardmarket.password!);
        await delay(500);

        logger.info("Enviando formulario de login");
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120_000 }),
          this.page.click('input[type="submit"]') // Clic en el botón submit (usualmente "Log in")
        ]);

        // Verificar éxito de login
        const loginError = await this.page.$('.alert-danger');
        if (loginError) {
          throw new Error("Credenciales incorrectas o error al hacer login");
        }

        logger.info("Login realizado con exito");
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("Credenciales incorrectas")) {
          throw error; // No reintentar si las credenciales están mal
        }

        if (attempt < maxAttempts) {
          logger.warn("Fallo durante el login. Reintentando...", {
            attempt,
            maxAttempts,
            retryDelayMs,
            error: errorMessage
          });
          await delay(retryDelayMs);
        } else {
          logger.error("Se agotaron todos los intentos para iniciar sesion", {
            maxAttempts,
            error: errorMessage
          });
          throw new Error(`No se pudo iniciar sesion despues de ${maxAttempts} intentos: ${errorMessage}`);
        }
      }
    }
  }
}
