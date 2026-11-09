// Builds the claude.ai preview: a single HTML fragment with all CSS, JS and
// fonts inlined (the preview host allows no other files and wraps the page in
// its own <html>/<head>/<body>). Output: dist-preview/infin8-content-os.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'dist-preview';
execSync('npx vite build --mode artifact', { stdio: 'inherit' });

const html = readFileSync(join(OUT_DIR, 'index.html'), 'utf8');
const read = (rel) => readFileSync(join(OUT_DIR, rel.replace(/^\.\//, '')), 'utf8');

const cssFiles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g)].map((m) => m[1]);
const jsFiles = [...html.matchAll(/<script type="module"[^>]*src="([^"]+\.js)"[^>]*><\/script>/g)].map((m) => m[1]);
if (cssFiles.length !== 1 || jsFiles.length !== 1) {
  throw new Error(`Expected one CSS and one JS bundle, found ${cssFiles.length} CSS and ${jsFiles.length} JS`);
}

// "</script" inside the bundle would end the inline <script> early; "<\/script"
// means the same thing in JS strings, templates and regular expressions.
const js = read(jsFiles[0]).replace(/<\/(script)/gi, '<\\/$1');
const css = read(cssFiles[0]).replace(/<\/(style)/gi, '<\\/$1');
if (/<!--/.test(js)) console.warn('warning: bundle contains "<!--"; check the preview loads.');

// The pre-paint theme script from index.html (explicit Dark/Light only).
const themeScript = html.match(/<script>\s*\/\/ Apply the saved theme[\s\S]*?<\/script>/)?.[0] ?? '';

const page = `<title>Infin8 Content OS</title>
<meta name="description" content="A private writing and archive space for social media content.">
<style>${css}</style>
${themeScript}
<div id="root"></div>
<script type="module">${js}</script>
`;

const target = join(OUT_DIR, 'infin8-content-os.html');
writeFileSync(target, page);
console.log(`\npreview page: ${target} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);
