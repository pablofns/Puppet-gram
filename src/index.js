import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initBrowser } from './browser.js';
import { isLoggedIn, handleLogin, publishPost } from './publisher.js';

// Obtener la ruta del directorio actual (necesario en ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const postsFilePath = path.join(rootDir, 'posts.json');

/**
 * Lee la cola de publicaciones desde posts.json.
 * @returns {Array}
 */
function readQueue() {
  try {
    if (!fs.existsSync(postsFilePath)) {
      return [];
    }
    const data = fs.readFileSync(postsFilePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('[Index] Error al leer posts.json:', error.message);
    return [];
  }
}

/**
 * Guarda la cola de publicaciones en posts.json.
 * @param {Array} queue 
 */
function saveQueue(queue) {
  try {
    fs.writeFileSync(postsFilePath, JSON.stringify(queue, null, 2), 'utf8');
  } catch (error) {
    console.error('[Index] Error al escribir en posts.json:', error.message);
  }
}

async function main() {
  console.log('====================================================');
  console.log('      INSTAGRAM AUTO-PUBLISHER STARTING             ');
  console.log(`      Hora local: ${new Date().toLocaleString()}    `);
  console.log('====================================================');

  const queue = readQueue();
  
  // Buscar el primer post pendiente
  const pendingPostIndex = queue.findIndex(post => post.status === 'pending');

  if (pendingPostIndex === -1) {
    console.log('[Index] No hay publicaciones pendientes en posts.json.');
    console.log('[Index] Agrega un post con "status": "pending" para publicar.');
    process.exit(0);
  }

  const post = queue[pendingPostIndex];
  console.log(`[Index] Encontrado post pendiente ID ${post.id}:`);
  console.log(`  - Imagen: ${post.imagePath}`);
  console.log(`  - Pie de foto: "${post.caption.substring(0, 50)}..."`);

  // Resolver la ruta de la imagen
  const absoluteImagePath = path.isAbsolute(post.imagePath)
    ? post.imagePath
    : path.resolve(rootDir, post.imagePath);

  if (!fs.existsSync(absoluteImagePath)) {
    console.error(`[Index] ERROR: La imagen no existe en la ruta: ${absoluteImagePath}`);
    post.status = 'failed';
    post.error = `Imagen no encontrada en la ruta: ${absoluteImagePath}`;
    saveQueue(queue);
    process.exit(1);
  }

  let browser;
  try {
    // Inicializar navegador
    browser = await initBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(60000); // 60 segundos de timeout por defecto

    // Asegurarse de que estamos logueados
    const loggedIn = await handleLogin(page);
    
    if (!loggedIn) {
      throw new Error('No se pudo verificar el inicio de sesión.');
    }

    // Ejecutar publicación
    await publishPost(page, absoluteImagePath, post.caption);

    // Si todo sale bien, actualizar el estado
    post.status = 'published';
    post.publishedAt = new Date().toISOString();
    delete post.error; // Limpiar errores si los había
    console.log(`[Index] Post ID ${post.id} publicado con éxito.`);

  } catch (error) {
    console.error(`[Index] ERROR durante la publicación del Post ID ${post.id}:`);
    console.error(error);

    // Marcar como fallido y registrar el error para evitar bucles
    post.status = 'failed';
    post.error = error.message;
    post.failedAt = new Date().toISOString();

  } finally {
    // Guardar cambios en la cola
    saveQueue(queue);

    if (browser) {
      console.log('[Index] Cerrando navegador...');
      await browser.close();
    }
    console.log('[Index] Proceso finalizado.');
    process.exit(0);
  }
}

main();
