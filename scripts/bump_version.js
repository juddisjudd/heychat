import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: bun run bump-version <new_version>');
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const paths = {
    package: path.join(rootDir, 'package.json'),
    tauri: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
    cargo: path.join(rootDir, 'src-tauri', 'Cargo.toml')
};

// 1. Update package.json
const pkg = JSON.parse(fs.readFileSync(paths.package, 'utf-8'));
pkg.version = newVersion;
fs.writeFileSync(paths.package, JSON.stringify(pkg, null, 2));
console.log(`Updated package.json to ${newVersion}`);

// 2. Update tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(paths.tauri, 'utf-8'));
tauriConf.version = newVersion;
fs.writeFileSync(paths.tauri, JSON.stringify(tauriConf, null, 2));
console.log(`Updated tauri.conf.json to ${newVersion}`);

// 3. Update Cargo.toml
let cargoContent = fs.readFileSync(paths.cargo, 'utf8');
// Regex to replace version = "x.y.z" inside [package] block
cargoContent = cargoContent.replace(/^version = ".*"/m, `version = "${newVersion}"`);
fs.writeFileSync(paths.cargo, cargoContent, 'utf8');
console.log(`Updated Cargo.toml to ${newVersion}`);

console.log('Version synchronization complete.');
