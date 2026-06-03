const fs = require('fs');
const path = require('path');

const replacements = [
  // Fix page.tsx inline colors
  [/color: 'var\(--tertiary\)'/g, "color: 'var(--lime)'"],
  [/borderTop: '2px solid var\(--tertiary\)'/g, "borderTop: '2px solid var(--outline-variant)'"],
  
  // Gemini AI button in bills/new/page.tsx
  [/\btext-amber-400\b/g, 'text-[var(--lime)]'],
  [/\bbg-amber-500\/20\b/g, 'bg-[rgba(200,241,53,0.15)]'],
  
  // Forms and Buttons
  [/\bhover:border-orange-500\b/g, 'hover:border-[var(--lime)]'],
  [/\bbg-orange-50\/50\b/g, 'bg-[rgba(200,241,53,0.05)]'],
  [/\btext-orange-600\b/g, 'text-[var(--lime)]'],

  // Catch any remaining hardcoded amber/orange
  [/\btext-amber-\d00\b/g, 'text-[var(--lime)]'],
  [/\bbg-amber-\d00(?:\/\d+)?\b/g, 'bg-[rgba(200,241,53,0.15)]'],
  [/\bborder-amber-\d00(?:\/\d+)?\b/g, 'border-[var(--lime)]'],
  [/\bfrom-amber-\d00\b/g, 'from-[var(--lime)]'],
  [/\bto-orange-\d00\b/g, 'to-[var(--lime)]'],
];

function walkDir(dir) {
  const files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      if (item !== 'node_modules' && item !== '.next') files.push(...walkDir(full));
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = path.join(__dirname, 'src');
const files = walkDir(srcDir);
let totalChanges = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed:', path.relative(__dirname, file));
    totalChanges++;
  }
}
console.log(`\nDone! ${totalChanges} files updated.`);
