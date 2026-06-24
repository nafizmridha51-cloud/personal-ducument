import fs from 'fs';
import path from 'path';

const distPath = path.resolve('dist');
const swPath = path.join(distPath, 'sw.js');

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

try {
  if (fs.existsSync(swPath)) {
    const allFiles = getFilesRecursively(distPath);
    const assetsToCache = ['/', '/index.html'];

    allFiles.forEach((file) => {
      const relativePath = path.relative(distPath, file);
      // Ignore service worker itself, maps, server bundle, etc.
      if (
        relativePath !== 'sw.js' &&
        relativePath !== 'server.cjs' &&
        relativePath !== 'server.cjs.map' &&
        !relativePath.endsWith('.map') &&
        !relativePath.startsWith('server')
      ) {
        assetsToCache.push('/' + relativePath.replace(/\\/g, '/'));
      }
    });

    // Also include fonts and the main icon
    assetsToCache.push('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    assetsToCache.push('https://cdn-icons-png.flaticon.com/512/5087/5087579.png');

    let swContent = fs.readFileSync(swPath, 'utf8');
    const replacement = `const ASSETS_TO_CACHE = ${JSON.stringify(assetsToCache, null, 2)};`;
    
    // Replace the placeholder array
    swContent = swContent.replace(/const ASSETS_TO_CACHE\s*=\s*\[[\s\S]*?\];/g, replacement);
    
    fs.writeFileSync(swPath, swContent, 'utf8');
    console.log('[SW Generator] Successfully injected assets into dist/sw.js:', assetsToCache);
  } else {
    console.error('[SW Generator] sw.js not found in dist!');
  }
} catch (err) {
  console.error('[SW Generator] Error generating sw.js:', err);
}
