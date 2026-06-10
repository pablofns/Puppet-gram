import path from 'path';
import fs from 'fs';

// Helper para pausar la ejecución con un tiempo aleatorio (simula comportamiento humano)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1000, max = 3000) => delay(Math.floor(Math.random() * (max - min + 1) + min));

/**
 * Espera a que un elemento esté disponible buscando por varios selectores o XPath.
 * @param {import('puppeteer').Page} page
 * @param {string[]} selectors Lista de selectores CSS.
 * @param {string[]} xpathExpressions Lista de expresiones XPath.
 * @param {number} timeout Tiempo de espera máximo en ms.
 * @returns {Promise<import('puppeteer').ElementHandle>}
 */
async function waitForElement(page, selectors = [], xpathExpressions = [], timeout = 15000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Intentar selectores CSS
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          // Verificar si es visible
          const isVisible = await el.boundingBox();
          if (isVisible) return el;
        }
      } catch (e) {
        // Ignorar error de selector inválido
      }
    }

    // Intentar expresiones XPath
    for (const xpath of xpathExpressions) {
      try {
        const elements = await page.$$(`xpath/${xpath}`);
        if (elements.length > 0) {
          const el = elements[0];
          const isVisible = await el.boundingBox();
          if (isVisible) return el;
        }
      } catch (e) {
        // Ignorar error
      }
    }

    await delay(500); // Esperar medio segundo antes de reintentar
  }

  throw new Error(`No se encontró el elemento con los selectores: [${selectors.join(', ')}] ni XPath: [${xpathExpressions.join(', ')}]`);
}

/**
 * Verifica si la sesión actual está logueada en Instagram.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn(page) {
  try {
    // Si vemos la barra de navegación lateral o el feed, estamos logueados
    const loggedInIndicators = [
      'a[href="/"]', // Enlace de inicio
      'svg[aria-label="Inicio"]',
      'svg[aria-label="Nueva publicación"]',
      'svg[aria-label="Crear"]',
      'span[text="Crear"]'
    ];

    for (const indicator of loggedInIndicators) {
      const el = await page.$(indicator);
      if (el) return true;
    }

    // Buscar si hay texto indicando el menú "Crear" por XPath
    const createXpath = await page.$$('xpath//span[text()="Crear"]');
    if (createXpath.length > 0) return true;

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Maneja el proceso de inicio de sesión de Instagram.
 * Si el navegador está en modo visible, le dará tiempo al usuario para loguearse manualmente.
 * @param {import('puppeteer').Page} page
 */
export async function handleLogin(page) {
  console.log('[Publisher] Verificando estado de inicio de sesión...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 4000);

  // Comprobar si ya estamos logueados
  if (await isLoggedIn(page)) {
    console.log('[Publisher] ¡Sesión activa detectada! No es necesario iniciar sesión.');
    return true;
  }

  console.log('[Publisher] No se detectó sesión activa. Redirigiendo a login...');

  // Intentar login automático si las credenciales están configuradas en .env
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;

  if (username && username !== 'tu_usuario_de_instagram' && password) {
    console.log('[Publisher] Intentando inicio de sesión automático...');
    try {
      // Esperar campos de entrada
      const userInput = await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      const passInput = await page.waitForSelector('input[name="password"]', { timeout: 10000 });

      // Escribir credenciales simulando escritura humana
      await userInput.click();
      await page.keyboard.type(username, { delay: 100 });
      await randomDelay(500, 1000);

      await passInput.click();
      await page.keyboard.type(password, { delay: 100 });
      await randomDelay(500, 1000);

      // Clic en botón "Iniciar sesión"
      const loginButton = await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
      await loginButton.click();
      
      console.log('[Publisher] Credenciales enviadas, esperando redirección...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      await randomDelay(3000, 5000);
      
      if (await isLoggedIn(page)) {
        console.log('[Publisher] ¡Inicio de sesión automático exitoso!');
        return true;
      }
    } catch (err) {
      console.log('[Publisher] Error durante el inicio de sesión automático:', err.message);
    }
  }

  // Si falla el automático o no hay credenciales, y estamos en modo visible,
  // guiar al usuario para que lo haga manualmente en la ventana.
  if (process.env.HEADLESS !== 'true') {
    console.log('\n==================================================================');
    console.log('[ATENCIÓN] INICIO DE SESIÓN REQUERIDO');
    console.log('Por favor, inicia sesión manualmente en la ventana del navegador.');
    console.log('Si tienes 2FA (doble factor), ingresa el código correspondiente.');
    console.log('El script detectará automáticamente cuando hayas ingresado con éxito.');
    console.log('==================================================================\n');

    // Esperar hasta que se loguee con un timeout largo de 5 minutos (300000 ms)
    const loginTimeout = 300000;
    const checkInterval = 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < loginTimeout) {
      if (await isLoggedIn(page)) {
        console.log('[Publisher] ¡Inicio de sesión manual detectado con éxito!');
        // Esperar un poco para que se guarden las cookies/localstorage
        await randomDelay(3000, 5000);
        return true;
      }
      await delay(checkInterval);
    }

    throw new Error('Tiempo de espera agotado para el inicio de sesión manual (5 minutos).');
  } else {
    throw new Error('No se pudo iniciar sesión. Configura las credenciales correctas o ejecuta en modo visible (HEADLESS=false) para loguearte la primera vez.');
  }
}

/**
 * Publica una foto en Instagram.
 * @param {import('puppeteer').Page} page
 * @param {string} imagePath Ruta absoluta de la imagen a subir.
 * @param {string} caption Texto del pie de foto.
 */
export async function publishPost(page, imagePath, caption) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`La imagen no existe en la ruta: ${imagePath}`);
  }

  console.log(`[Publisher] Iniciando proceso de publicación de: ${path.basename(imagePath)}`);
  
  // Asegurarse de estar en la página principal
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 4000);

  // 1. Buscar y hacer clic en el botón "Crear" / "Nueva publicación"
  console.log('[Publisher] Buscando el botón "Crear"...');
  const createBtn = await waitForElement(
    page,
    [
      'svg[aria-label="Nueva publicación"]',
      'svg[aria-label="Crear"]',
      'svg[aria-label="Direct, explore, creator and profile navigation. Creating a new post."] ',
      '[role="button"] a[href^="/create/"]',
    ],
    [
      '//span[text()="Crear"]',
      '//a[contains(@href, "create")]',
      '//div[@role="button" and contains(., "Crear")]'
    ]
  );
  
  await createBtn.click();
  console.log('[Publisher] Botón "Crear" clickeado. Esperando que se abra el modal...');
  await randomDelay(2000, 3000);

  // 2. Subir el archivo de la imagen
  console.log('[Publisher] Buscando el selector de archivos (input[type="file"])...');
  // Instagram tiene un input tipo file oculto en el modal. Lo buscamos y subimos el archivo.
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
  await fileInput.uploadFile(imagePath);
  console.log('[Publisher] Archivo cargado al input. Esperando carga...');
  await randomDelay(3000, 5000);

  // 3. Pantalla de Ajustes/Recorte: Hacer clic en "Siguiente"
  console.log('[Publisher] En pantalla de recorte. Buscando botón "Siguiente"...');
  let nextBtn = await waitForElement(
    page,
    [],
    [
      '//div[@role="button" and text()="Siguiente"]',
      '//button[text()="Siguiente"]',
      '//div[contains(text(), "Siguiente")]'
    ]
  );
  await nextBtn.click();
  console.log('[Publisher] Clic en Siguiente (Recorte).');
  await randomDelay(2000, 3000);

  // 4. Pantalla de Filtros: Hacer clic en "Siguiente" de nuevo
  console.log('[Publisher] En pantalla de filtros. Buscando botón "Siguiente"...');
  nextBtn = await waitForElement(
    page,
    [],
    [
      '//div[@role="button" and text()="Siguiente"]',
      '//button[text()="Siguiente"]',
      '//div[contains(text(), "Siguiente")]'
    ]
  );
  await nextBtn.click();
  console.log('[Publisher] Clic en Siguiente (Filtros).');
  await randomDelay(2000, 3000);

  // 5. Escribir el pie de foto
  console.log('[Publisher] Escribiendo pie de foto...');
  const captionArea = await waitForElement(
    page,
    [
      'div[aria-label="Escribe un pie de foto..."]',
      'div[contenteditable="true"]',
      'textarea'
    ]
  );
  
  await captionArea.focus();
  await randomDelay(500, 1000);
  // Escribir el pie de foto con simulación de pulsaciones
  await page.keyboard.type(caption, { delay: 60 });
  await randomDelay(1500, 3000);

  // 6. Hacer clic en "Compartir"
  console.log('[Publisher] Buscando botón "Compartir"...');
  const shareBtn = await waitForElement(
    page,
    [],
    [
      '//div[@role="button" and text()="Compartir"]',
      '//button[text()="Compartir"]',
      '//div[contains(text(), "Compartir")]'
    ]
  );
  
  await shareBtn.click();
  console.log('[Publisher] Clic en Compartir realizado. Subiendo publicación...');

  // 7. Esperar a que se complete la subida (suele tardar de 5 a 15 segundos)
  console.log('[Publisher] Esperando confirmación de subida...');
  
  // Esperar a que aparezca un mensaje de confirmación
  const successIndicator = await waitForElement(
    page,
    [],
    [
      '//*[contains(text(), "compartido tu publicación")]',
      '//*[contains(text(), "Se ha compartido")]',
      '//*[contains(text(), "publicación se ha compartido")]',
      '//h2[text()="Se ha compartido tu publicación"]'
    ],
    45000 // 45 segundos de timeout para subidas lentas
  );

  console.log('[Publisher] ¡Publicación compartida con éxito! Confirmado por la UI.');
  await randomDelay(3000, 5000);
}
