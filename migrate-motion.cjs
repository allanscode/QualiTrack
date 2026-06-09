const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Replace imports
    content = content.replace(/import\s*\{\s*motion\s*,?\s*AnimatePresence\s*\}\s*from\s*['"]motion\/react['"];?/g, "import { m, AnimatePresence } from 'motion/react';");
    content = content.replace(/import\s*\{\s*motion\s*\}\s*from\s*['"]motion\/react['"];?/g, "import { m } from 'motion/react';");
    content = content.replace(/import\s*\{\s*motion\s*,\s*AnimatePresence\s*,\s*AnimateSharedLayout\s*\}\s*from\s*['"]motion\/react['"];?/g, "import { m, AnimatePresence, AnimateSharedLayout } from 'motion/react';");

    // Replace JSX tags
    content = content.replace(/<motion\./g, "<m.");
    content = content.replace(/<\/motion\./g, "</m.");
    
    // Replace layoutId if used conditionally with motion?
    // What if motion is used as a function like motion(Component)?
    content = content.replace(/motion\(/g, "m(");
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
