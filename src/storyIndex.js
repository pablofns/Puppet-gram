import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initBrowser } from './browser.js';
import { handleLogin } from './publisher.js';
import { publishStory } from './storyPublisher.js';

// Ruta del directorio raíz del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const storiesFilePath = path.join(rootDir, 'stories.json');

/**
 * Lee la cola de historias desde stories.json.
 * @returns {Array}
 */
function readQueue() {
  try {
    if (!fs.existsSync(storiesFilePath)) {
      return [];
    }
    const data = fs.readFileSync(storiesFilePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('[StoryIndex] Error al leer stories.json:', error.message);
    return [];
  }
}

/**
 * Guarda la cola de historias en stories.json.
 * @param {Array} queue
 */
function saveQueue(queue) {
  try {
    fs.writeFileSync(storiesFilePath, JSON.stringify(queue, null, 2), 'utf8');
  } catch (error) {
    console.error('[StoryIndex] Error al escribir en stories.json:', error.message);
  }
}

async function main() {
  console.log('====================================================');
  console.log('      INSTAGRAM STORY PUBLISHER STARTING             ');
  console.log(`      Hora local: ${new Date().toLocaleString()}    `);
  console.log('====================================================');

  const queue = readQueue();
  const pendingIndex = queue.findIndex(story => story.status === 'pending');

  if (pendingIndex === -1) {
    console.log('[StoryIndex] No hay historias pendientes en stories.json.');
    console.log('[StoryIndex] Agrega una historia con "status": "pending" para publicar.');
    process.exit(0);
  }

  const story = queue[pendingIndex];
  console.log(`[StoryIndex] Encontrada historia pendiente ID ${story.id}:`);
  console.log(`  - Imagen: ${story.imagePath}`);

  // Resolver ruta absoluta de la imagen
  const absoluteImagePath = path.isAbsolute(story.imagePath)
    ? story.imagePath
    : path.resolve(rootDir, story.imagePath);

  if (!fs.existsSync(absoluteImagePath)) {
    console.error(`[StoryIndex] ERROR: La imagen no existe en la ruta: ${absoluteImagePath}`);
    story.status = 'failed';
    story.error = `Imagen no encontrada en la ruta: ${absoluteImagePath}`;
    saveQueue(queue);
    process.exit(1);
  }

  let browser;
  try {
    browser = await initBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Verificar login
    const loggedIn = await handleLogin(page);
    if (!loggedIn) {
      throw new Error('No se pudo verificar el inicio de sesión.');
    }

    // Publicar historia
    await publishStory(page, absoluteImagePath);

    // Actualizar estado
    story.status = 'published';
    story.publishedAt = new Date().toISOString();
    delete story.error;
    console.log(`[StoryIndex] Historia ID ${story.id} publicada con éxito.`);
  } catch (error) {
    console.error(`[StoryIndex] ERROR durante la publicación de la historia ID ${story.id}:`);
    console.error(error);
    story.status = 'failed';
    story.error = error.message;
    story.failedAt = new Date().toISOString();
  } finally {
    saveQueue(queue);
    if (browser) {
      console.log('[StoryIndex] Cerrando navegador...');
      await browser.close();
    }
    console.log('[StoryIndex] Proceso finalizado.');
    process.exit(0);
  }
}

main();
