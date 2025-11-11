#!/usr/bin/env node

/**
 * Install Plugin Files - Self-Installing Script
 * 
 * This script automatically installs its own dependencies on first run.
 * 
 * Usage:
 *   node install-plugin-files.js @wix/vibe-stores-plugin@0.8.8 ./output
 *   node install-plugin-files.js https://github.com/.../plugin.tar.gz ./output
 * 
 * Dependencies are installed to ./.deps/ directory automatically.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Self-install dependencies
const DEPS_DIR = path.join(__dirname, '.deps');
const REQUIRED_PACKAGES = ['adm-zip'];

function ensureDependencies() {
  const needsInstall = REQUIRED_PACKAGES.some(pkg => {
    try {
      require.resolve(pkg);
      return false;
    } catch {
      return true;
    }
  });

  if (needsInstall) {
    console.log('📦 Installing dependencies...');
    if (!fs.existsSync(DEPS_DIR)) {
      fs.mkdirSync(DEPS_DIR, { recursive: true });
    }
    
    try {
      execSync(`cd ${DEPS_DIR} && npm install ${REQUIRED_PACKAGES.join(' ')} --silent`, {
        stdio: 'inherit'
      });
      console.log('✅ Dependencies installed\n');
    } catch (err) {
      console.error('❌ Failed to install dependencies');
      process.exit(1);
    }
  }
  
  // Add deps to require path
  const nodeModulesPath = path.join(DEPS_DIR, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    require('module').globalPaths.unshift(nodeModulesPath);
  }
}

// Ensure dependencies before loading them
ensureDependencies();
const AdmZip = require('adm-zip');

// Parse arguments
const [pluginSpecifier, destDir] = process.argv.slice(2);

if (!pluginSpecifier || !destDir) {
  console.error('❌ Error: Plugin specifier and destination directory are required');
  console.error('Usage: node install-plugin-files.js <package@version|tarball-url> <dest-dir>');
  console.error('Example: node install-plugin-files.js @wix/vibe-stores-plugin@0.8.8 ./output');
  process.exit(1);
}

console.log('🚀 Starting plugin files installation...');
console.log('📦 Plugin:', pluginSpecifier);
console.log('📁 Destination:', destDir);
console.log('');

function downloadFile(url, outputPath, callback) {
  const client = url.startsWith('https') ? https : http;
  
  client.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      console.log('  ↪️  Following redirect:', res.headers.location);
      return downloadFile(res.headers.location, outputPath, callback);
    }
    
    console.log('  ✅ Response status:', res.statusCode);
    res.pipe(fs.createWriteStream(outputPath)).on('finish', callback);
  }).on('error', (err) => {
    console.error('  ❌ Download error:', err.message);
    process.exit(1);
  });
}

function extractZip(zipPath, destDir) {
  console.log('  📂 Extracting ZIP...');
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  
  let count = 0;
  entries.forEach((entry) => {
    if (!entry.isDirectory) {
      const relativePath = entry.entryName.replace(/^[^\/]+\//, '');
      const targetPath = path.join(destDir, relativePath);
      
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, entry.getData());
      
      count++;
      console.log('    ✓', relativePath);
    }
  });
  
  return count;
}

function processPlugin(packageJson) {
  console.log('✅ Plugin found:', packageJson.name + '@' + packageJson.version);
  console.log('');
  
  const pluginFilesPackageName = packageJson.name.replace('-plugin', '-plugin-files');
  console.log('🔍 Looking for dependency:', pluginFilesPackageName);
  
  const depVersion = packageJson.dependencies[pluginFilesPackageName];
  if (!depVersion) {
    console.error('❌ Dependency not found');
    process.exit(1);
  }
  
  console.log('  📌 Raw version:', depVersion);
  
  const version = depVersion
    .replace(/^workspace:/, '')
    .replace(/^https?:\/\/.+\/(.+)\.tar\.gz$/, '$1');
  
  console.log('  📌 Resolved version:', version);
  
  const match = packageJson.name.match(/@wix\/vibe-(.+)-plugin/);
  if (!match) {
    console.error('❌ Could not parse plugin name');
    process.exit(1);
  }
  
  const shortName = match[1];
  console.log('  📌 Plugin short name:', shortName);
  
  const zipUrl = `https://static.parastorage.com/services/vibe-${shortName}-plugin-files/${version}/vibe-${shortName}-plugin-files-files.zip`;
  
  console.log('');
  console.log('📥 Downloading plugin-files ZIP...');
  console.log('  🔗 URL:', zipUrl);
  
  const zipPath = shortName + '.zip';
  
  downloadFile(zipUrl, zipPath, () => {
    const stats = fs.statSync(zipPath);
    console.log('  ✅ Downloaded:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    console.log('');
    
    console.log('📂 Extracting plugin files...');
    const count = extractZip(zipPath, destDir);
    
    fs.unlinkSync(zipPath);
    
    console.log('  ✅ Total files extracted:', count);
    console.log('');
    console.log('✨ Done! All files extracted to:', destDir);
  });
}

// Main execution
if (pluginSpecifier.startsWith('http')) {
  console.log('📥 Mode: Tarball URL');
  console.log('🌐 Downloading plugin tarball...');
  console.log('  🔗 URL:', pluginSpecifier);
  
  const tgzPath = 'plugin.tgz';
  
  downloadFile(pluginSpecifier, tgzPath, () => {
    const stats = fs.statSync(tgzPath);
    console.log('  ✅ Downloaded:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    
    console.log('📦 Extracting tarball...');
    try {
      execSync('tar -xzf ' + tgzPath);
      console.log('  ✅ Tarball extracted');
    } catch (err) {
      console.error('  ❌ Failed to extract tarball');
      fs.unlinkSync(tgzPath);
      process.exit(1);
    }
    
    console.log('📖 Reading package.json...');
    const packageJson = JSON.parse(fs.readFileSync('package/package.json', 'utf8'));
    
    fs.unlinkSync(tgzPath);
    fs.rmSync('package', { recursive: true });
    
    console.log('  ✅ Package.json loaded');
    console.log('');
    
    processPlugin(packageJson);
  });
} else {
  console.log('📥 Mode: NPM Registry');
  
  const match = pluginSpecifier.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
  if (!match) {
    console.error('❌ Invalid package specifier');
    process.exit(1);
  }
  
  const packageName = match[1];
  const version = match[2] || 'latest';
  
  console.log('  📦 Package name:', packageName);
  console.log('  📌 Version:', version);
  
  const registryUrl = `https://registry.npmjs.org/${packageName.replace('/', '%2F')}/${version}`;
  
  console.log('🌐 Fetching metadata from npm...');
  console.log('  🔗 URL:', registryUrl);
  
  https.get(registryUrl, (res) => {
    console.log('  ✅ Response status:', res.statusCode);
    
    if (res.statusCode !== 200) {
      console.error('  ❌ Failed to fetch package metadata');
      process.exit(1);
    }
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('  ✅ Metadata received:', (data.length / 1024).toFixed(2), 'KB');
      console.log('');
      
      processPlugin(JSON.parse(data));
    });
  }).on('error', (err) => {
    console.error('  ❌ Request error:', err.message);
    process.exit(1);
  });
}
