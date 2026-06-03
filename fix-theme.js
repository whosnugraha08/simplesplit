const fs = require('fs');
const path = require('path');

const replacements = [
  [/\btext-espresso\b/g, 'text-[var(--on-surface)]'],
  [/\btext-warm-muted\b/g, 'text-[var(--outline)]'],
  [/\bborder-warm-border\b/g, 'border-[var(--outline-variant)]'],
  [/\bbg-cream\b/g, 'bg-[var(--bg)]'],
  [/\bshadow-warm\b/g, ''],
  [/\btext-ruby(?!-)\b/g, 'text-[var(--red)]'],
  [/\btext-forest(?!-)\b/g, 'text-[var(--lime)]'],
  [/\bbg-ruby-light\b/g, 'bg-[rgba(255,92,92,0.15)]'],
  [/\bbg-forest-light\b/g, 'bg-[rgba(200,241,53,0.15)]'],
  [/\bbg-blush(?!\/)\b/g, 'bg-[var(--surface-container)]'],
  [/\bbg-blush\/\d+\b/g, 'bg-[var(--surface-container)]'],
  [/\bbg-white\b/g, 'bg-[var(--navy)]'],
  [/\btext-primary\b/g, 'text-[var(--lime)]'],
  [/\bbg-primary(?![\/-])\b/g, 'bg-[var(--primary-container)]'],
  [/\bbg-primary\/\d+\b/g, 'bg-[rgba(108,63,212,0.15)]'],
  [/\bborder-primary(?![\/-])\b/g, 'border-[var(--lime)]'],
  [/\bborder-primary\/\d+\b/g, 'border-[rgba(200,241,53,0.3)]'],
  [/\bfrom-primary\b/g, 'from-[var(--primary-container)]'],
  [/\bto-accent\b/g, 'to-[var(--lime)]'],
  [/\bbg-gradient-to-br from-\[var\(--primary-container\)\] to-\[var\(--lime\)\]\b/g, 'bg-[var(--primary-container)]'],
  [/\bbg-ruby\b/g, 'bg-[var(--red)]'],
  [/\bbg-forest\b/g, 'bg-[var(--lime)]'],
  [/\btext-amber-800\b/g, 'text-[var(--tertiary)]'],
  [/\bbg-amber-100\b/g, 'bg-[rgba(255,183,129,0.15)]'],
  [/\bshadow-sm\b/g, ''],
  [/\brounded-card\b/g, 'rounded-xl'],
  [/\bborder-ruby\/\d+\b/g, 'border-[var(--red)]'],
  [/\bborder-forest\/\d+\b/g, 'border-[var(--lime)]'],
  [/\bhover:bg-blush\/\d+\b/g, 'hover:bg-[var(--surface-container-high)]'],
  [/\bhover:text-espresso\b/g, 'hover:text-[var(--on-surface)]'],
  [/\bhover:bg-ruby-light\b/g, 'hover:bg-[rgba(255,92,92,0.2)]'],
  [/\bhover:text-ruby\b/g, 'hover:text-[var(--red)]'],
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
