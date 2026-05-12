const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'frontend', 'dist');
const dest = path.join(__dirname, '..', 'www');

if (!fs.existsSync(src)) {
  console.error('❌ Build do frontend não encontrada. Rode "npm run build:cordova" dentro de /frontend primeiro.');
  process.exit(1);
}

function copyDir(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
copyDir(src, dest);

// Injeta o script do Cordova no index.html
const indexPath = path.join(dest, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('cordova.js')) {
    html = html.replace('<head>', '<head>\n    <script src="cordova.js"></script>');
    fs.writeFileSync(indexPath, html);
  }
}

console.log('✅ Arquivos web copiados para /mobile/www');
