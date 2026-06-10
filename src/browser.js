import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config();

// Usar el plugin stealth para evitar la detección
puppeteer.use(StealthPlugin());

/**
 * Inicializa y retorna una instancia del navegador Puppeteer.
 * @param {Object} options Opciones de configuración adicionales.
 * @returns {Promise<import('puppeteer').Browser>} Instancia del navegador.
 */
export async function initBrowser(options = {}) {
  const headless = process.env.HEADLESS === 'true';
  const userDataDir = process.env.USER_DATA_DIR 
    ? path.resolve(process.env.USER_DATA_DIR) 
    : path.resolve('./session');

  console.log(`[Browser] Iniciando navegador en modo headless: ${headless}`);
  console.log(`[Browser] Usando directorio de sesión: ${userDataDir}`);

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false, // 'new' para la nueva interfaz headless de Puppeteer
    userDataDir: userDataDir,
    defaultViewport: {
      width: 1280,
      height: 850,
      deviceScaleFactor: 1,
    },
    args: [
      '--disable-notifications',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--lang=es-ES,es', // Establecer idioma español para consistencia en la UI
      '--disable-features=IsolateOrigins,site-per-process', // Ayuda con iframes y selectores
      '--window-size=1280,850',
    ],
    ...options
  });

  return browser;
}
