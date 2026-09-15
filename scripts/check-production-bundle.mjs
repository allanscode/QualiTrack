import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(js|html|map)$/.test(file)) {
      const text = await readFile(file, 'utf8');
      if (/demo1234|Admin123!|qualitrack_mock_|webposto\.zendesk\.com\/agent\/tickets\/154|sb_secret_/.test(text)) {
        throw new Error(`Material de demonstração ou secret key no bundle: ${file}`);
      }
      if (file.endsWith('.map')) throw new Error(`Source map público: ${file}`);
    }
  }
}
await scan('dist');
console.log('Bundle sem marcadores de seed, senhas demo, secret keys ou source maps.');
