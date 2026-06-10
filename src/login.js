import { initBrowser } from './browser.js';
import { handleLogin } from './publisher.js';

async function main() {
  console.log('====================================================');
  console.log('  INICIALIZADOR DE SESIÓN - INSTAGRAM AUTOMATOR  ');
  console.log('====================================================');
  
  // Forzar HEADLESS=false para la inicialización
  process.env.HEADLESS = 'false';
  
  let browser;
  try {
    browser = await initBrowser();
    const page = await browser.newPage();
    
    // Configurar timeout largo
    page.setDefaultTimeout(60000);
    
    // Iniciar el proceso de login
    await handleLogin(page);
    
    console.log('\n[ÉXITO] La sesión se ha guardado correctamente.');
    console.log('Ya puedes cerrar este script e iniciar publicaciones automáticas.');
    
  } catch (error) {
    console.error('\n[ERROR] Ocurrió un problema durante el login:', error.message);
  } finally {
    if (browser) {
      console.log('[Info] Cerrando navegador...');
      await browser.close();
    }
    process.exit(0);
  }
}

main();
