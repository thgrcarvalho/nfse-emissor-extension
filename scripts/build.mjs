// Builds the per-browser store packages under dist/.
//
// The source manifest.json carries the keys for every browser at once (Chrome warns
// about the Firefox-only keys and vice versa); the store packages get a clean,
// browser-specific manifest each:
//  - dist/chrome/  + nfse-emissor-chrome-v{V}.zip   → Chrome Web Store and Edge Add-ons
//  - dist/firefox/ + nfse-emissor-firefox-v{V}.zip  → Firefox AMO
//
// The real src/config.default.json is personal (gitignored) and must NEVER ship:
// the sanitized config.example.json is staged as the bundled config.default.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function stage(name, patch) {
  const dir = path.join(dist, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.cpSync(path.join(root, 'icons'), path.join(dir, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'src'))) {
    if (f === 'config.default.json' || f === 'config.example.json') continue;
    fs.copyFileSync(path.join(root, 'src', f), path.join(dir, 'src', f));
  }
  fs.copyFileSync(
    path.join(root, 'src', 'config.example.json'),
    path.join(dir, 'src', 'config.default.json'),
  );

  const m = structuredClone(manifest);
  patch(m);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');

  const zip = path.join(dist, `nfse-emissor-${name}-v${manifest.version}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-X', zip, '.'], { cwd: dir, stdio: 'pipe' });
  return zip;
}

const chromeZip = stage('chrome', (m) => {
  delete m.background.scripts; // Firefox-only (MV3 event page)
  delete m.sidebar_action;
  delete m.browser_specific_settings;
  // sidePanel.setPanelBehavior({openPanelOnActionClick}) is the floor; sw.js
  // feature-detects sidePanel.open (116+) on top of it.
  m.minimum_chrome_version = '114';
});

const firefoxZip = stage('firefox', (m) => {
  delete m.background.service_worker; // Chrome-only (Firefox MV3 has no SW background)
  delete m.side_panel;
  m.permissions = m.permissions.filter((p) => p !== 'sidePanel');
});

// Guard: the staged bundled config must be byte-identical to the sanitized example.
const example = fs.readFileSync(path.join(root, 'src', 'config.example.json'));
for (const name of ['chrome', 'firefox']) {
  const staged = fs.readFileSync(path.join(dist, name, 'src', 'config.default.json'));
  if (!staged.equals(example)) {
    throw new Error(`dist/${name}: bundled config differs from config.example.json — aborting`);
  }
}

console.log('built:');
console.log('  ' + chromeZip);
console.log('  ' + firefoxZip);
