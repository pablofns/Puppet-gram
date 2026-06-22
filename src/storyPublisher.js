import path from 'path';
import puppeteerExtra from 'puppeteer-extra';
import fs from 'fs';
import { handleLogin } from './publisher.js';

/**
 * Helper: espera a que un elemento esté disponible (CSS o XPath) con timeout.
 */
async function waitForElement(page, selectors = [], xpathExpressions = [], timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          const box = await el.boundingBox();
          if (box) return el;
        }
      } catch (_) { }
    }
    for (const xp of xpathExpressions) {
      try {
        const els = await page.$$(
          `xpath/${xp}`
        );
        if (els.length) {
          const box = await els[0].boundingBox();
          if (box) return els[0];
        }
      } catch (_) { }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Elemento no encontrado: ${selectors.concat(xpathExpressions).join(', ')}`);
}

/**
 * Publica una historia (Story) en Instagram emulando un móvil.
 * @param {import('puppeteer').Page} page
 * @param {string} imagePath Ruta absoluta de la imagen.
 */
export async function publishStory(page, imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Imagen no encontrada: ${imagePath}`);
  }

  // Configurar emulación móvil manual (viewport y user‑agent)
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
  console.log('[StoryPublisher] Emulación móvil manual aplicada');
  // Recargar la página para que la UI móvil se renderice
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000)); // espera adicional
  // Continuar con navegación a Instagram
  console.log('[StoryPublisher] Navegando a Instagram (versión móvil)');
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Asegurarse de estar logueado (usar lógica existente)
  const loggedIn = await handleLogin(page);
  if (!loggedIn) {
    throw new Error('No se pudo iniciar sesión para publicar la historia');
  }

  // 1. Click en el botón de "Crear historia" / "Your story"
  console.log('[StoryPublisher] Buscando botón de crear historia');
  let createBtn;
  try {
    createBtn = await waitForElement(page, [], [
      "//span[contains(text(),'Historia') or contains(text(),'Your story') or contains(text(),'Nueva historia')]",
      "//div[@role='button' and .//span[contains(text(),'Historia')]]",
      "//svg[@aria-label='Nueva historia']",
      "//svg[@aria-label='New story']",
      // Nuevos selectores más genéricos
      "//div[@role='button' and contains(@aria-label,'Historia')]",
      "//div[@role='button' and contains(@aria-label,'Story')]",
      "//button[contains(@aria-label,'Historia') or contains(@aria-label,'Story')]"
    ]);
  } catch (err) {
    console.error('[StoryPublisher] No se encontró el botón de crear historia:', err.message);
    // Capturar screenshot para depuración
    const screenshotPath = `screenshots/fail_create_story_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[StoryPublisher] Screenshot guardado en ${screenshotPath}`);
    throw err; // rethrow para que el flujo superior maneje el fallo
  }
  await page.evaluate(el => {
    const interactive = el.closest('a, button, [role="button"]') || el;
    interactive.click();
  }, createBtn);
  await new Promise(r => setTimeout(r, 1500));

  // 2. Subir la imagen al input file que aparece en el modal móvil
  console.log('[StoryPublisher] Buscando input file para cargar la imagen');
  // Convertir ruta relativa a absoluta y validar existencia
  const absoluteImagePath = path.resolve(process.cwd(), imagePath);
  const normalizedPath = path.normalize(absoluteImagePath);
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Imagen no encontrada en ruta absoluta: ${normalizedPath}`);
  }
  console.log('[StoryPublisher] Subiendo imagen desde', normalizedPath);
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
  await fileInput.uploadFile(normalizedPath);
  await new Promise(r => setTimeout(r, 3000));

  // 3. En la pantalla de edición, buscar botón "Compartir" o "Add to your story"
  console.log('[StoryPublisher] Buscando botón "Compartir"');
  const shareBtn = await waitForElement(page, [], [
    "//button[contains(text(),'Compartir') or contains(text(),'Add to your story') or contains(text(),'Publicar')]",
    "//div[@role='button' and (text()='Compartir' or text()='Add to your story' or text()='Publicar')]"
  ]);
  await shareBtn.click();
  console.log('[StoryPublisher] Historia compartida, esperando confirmación');

  // Esperar mensaje de éxito
  await waitForElement(page, [], [
    "//*[contains(text(),'tu historia ha sido publicada') or contains(text(),'Your story has been shared')]"
  ], 30000).catch(() => { });

  console.log('[StoryPublisher] Publicación de historia completada');
}
