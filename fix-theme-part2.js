const fs = require('fs');
const path = require('path');

const replacements = [
  // Gradients
  [/\bbg-gradient-to-r from-amber-500 to-orange-500\b/g, 'btn-primary'],
  [/\bbg-gradient-to-br from-amber-500\/10 to-orange-500\/5\b/g, 'bg-[var(--surface-container)]'],
  [/\bbg-gradient-to-r from-red-500 to-rose-600\b/g, 'bg-[var(--red)] text-white'],
  [/\bbg-gradient-to-r from-emerald-500 to-teal-600\b/g, 'bg-[var(--primary-container)] text-[var(--on-primary-container)]'],
  
  // Texts
  [/\btext-amber-400\b/g, 'text-[var(--lime)]'],
  [/\btext-amber-500\b/g, 'text-[var(--lime)]'],
  [/\btext-amber-600\b/g, 'text-[var(--lime)]'],
  [/\btext-amber-700\b/g, 'text-[var(--lime)]'],
  [/\btext-orange-500\b/g, 'text-[var(--lime)]'],
  [/\btext-orange-600\b/g, 'text-[var(--lime)]'],
  [/\bhover:text-amber-500\b/g, 'hover:text-[var(--lime)]'],

  // Backgrounds
  [/\bbg-amber-500\/10\b/g, 'bg-[rgba(200,241,53,0.1)]'],
  [/\bbg-amber-500\/20\b/g, 'bg-[rgba(200,241,53,0.2)]'],
  [/\bbg-amber-500\/30\b/g, 'bg-[rgba(200,241,53,0.3)]'],
  [/\bbg-amber-500\b/g, 'bg-[var(--lime)] text-black'],
  [/\bbg-amber-50\b/g, 'bg-[rgba(200,241,53,0.05)]'],
  [/\bbg-orange-50\/50\b/g, 'bg-[rgba(200,241,53,0.05)]'],

  // Borders
  [/\bborder-amber-500\/20\b/g, 'border-[rgba(200,241,53,0.2)]'],
  [/\bborder-amber-500\/30\b/g, 'border-[rgba(200,241,53,0.3)]'],
  [/\bborder-amber-500\/40\b/g, 'border-[rgba(200,241,53,0.4)]'],
  [/\bborder-amber-500\/50\b/g, 'border-[rgba(200,241,53,0.5)]'],
  [/\bborder-amber-200\b/g, 'border-[rgba(200,241,53,0.3)]'],
  [/\bborder-orange-500\b/g, 'border-[var(--lime)]'],
  [/\bhover:border-amber-500\/30\b/g, 'hover:border-[rgba(200,241,53,0.5)]'],
  [/\bhover:border-orange-500\b/g, 'hover:border-[var(--lime)]'],
  
  // Shadows
  [/\bshadow-amber-500\/20\b/g, 'shadow-none'],
  [/\bshadow-lg\b/g, ''],
  
  // Rings
  [/\bfocus:ring-amber-500\/40\b/g, 'focus:ring-[rgba(200,241,53,0.4)]'],
  [/\bfocus:ring-amber-500\/50\b/g, 'focus:ring-[rgba(200,241,53,0.5)]'],
  [/\bfocus:border-amber-500\/30\b/g, 'focus:border-[rgba(200,241,53,0.5)]'],
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
