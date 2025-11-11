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
// Use process.cwd() when running from stdin (node -), otherwise use script directory
const scriptDir = __dirname === '.' ? process.cwd() : __dirname;
const DEPS_DIR = path.join(scriptDir, '.deps');
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
    console.log('  📁 Installing to:', DEPS_DIR);
    
    if (!fs.existsSync(DEPS_DIR)) {
      fs.mkdirSync(DEPS_DIR, { recursive: true });
    }
    
    // Create a minimal package.json to isolate from parent project
    const packageJsonPath = path.join(DEPS_DIR, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      fs.writeFileSync(packageJsonPath, JSON.stringify({
        name: 'install-plugin-files-deps',
        version: '1.0.0',
        private: true
      }, null, 2));
    }
    
    try {
      execSync(
        `cd "${DEPS_DIR}" && npm install ${REQUIRED_PACKAGES.join(' ')} --legacy-peer-deps --loglevel=error`, 
        { stdio: 'inherit' }
      );
      console.log('✅ Dependencies installed\n');
    } catch (err) {
      console.error('❌ Failed to install dependencies');
      console.error('  Tip: You can pre-install adm-zip to avoid this:');
      console.error('       npm install -g adm-zip');
      console.error('       or: npm install adm-zip (in your project)');
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
  
  const request = client.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      console.log('  ↪️  Following redirect:', res.headers.location);
      return downloadFile(res.headers.location, outputPath, callback);
    }
    
    if (res.statusCode !== 200) {
      console.error('  ❌ Download failed with status:', res.statusCode);
      console.error('  URL:', url);
      process.exit(1);
    }
    
    console.log('  ✅ Response status:', res.statusCode);
    
    const fileStream = fs.createWriteStream(outputPath);
    
    fileStream.on('error', (err) => {
      console.error('  ❌ File write error:', err.message);
      console.error('  Path:', outputPath);
      try { fs.unlinkSync(outputPath); } catch {}
      process.exit(1);
    });
    
    res.on('error', (err) => {
      console.error('  ❌ Download stream error:', err.message);
      try { fs.unlinkSync(outputPath); } catch {}
      process.exit(1);
    });
    
    res.pipe(fileStream).on('finish', callback);
  });
  
  request.on('error', (err) => {
    console.error('  ❌ Network error:', err.message);
    console.error('  URL:', url);
    console.error('  Tip: Check your internet connection and firewall settings');
    process.exit(1);
  });
  
  request.setTimeout(30000, () => {
    request.destroy();
    console.error('  ❌ Download timeout (30s)');
    console.error('  URL:', url);
    process.exit(1);
  });
}

function extractZip(zipPath, destDir) {
  console.log('  📂 Extracting ZIP...');
  
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err) {
    console.error('  ❌ Failed to read ZIP file:', err.message);
    console.error('  Path:', zipPath);
    console.error('  Tip: The downloaded file might be corrupted');
    process.exit(1);
  }
  
  const entries = zip.getEntries();
  
  if (entries.length === 0) {
    console.error('  ❌ ZIP file is empty');
    process.exit(1);
  }
  
  let count = 0;
  entries.forEach((entry) => {
    if (!entry.isDirectory) {
      try {
        const relativePath = entry.entryName.replace(/^[^\/]+\//, '');
        const targetPath = path.join(destDir, relativePath);
        
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
        
        count++;
        console.log('    ✓', relativePath);
      } catch (err) {
        console.error('    ❌ Failed to extract:', entry.entryName);
        console.error('       Error:', err.message);
        // Continue with other files
      }
    }
  });
  
  if (count === 0) {
    console.error('  ❌ No files were extracted');
    process.exit(1);
  }
  
  return count;
}

function processPlugin(packageJson) {
  try {
    if (!packageJson || !packageJson.name) {
      console.error('❌ Invalid package.json');
      process.exit(1);
    }
    
    console.log('✅ Plugin found:', packageJson.name + '@' + packageJson.version);
    console.log('');
    
    const pluginFilesPackageName = packageJson.name.replace('-plugin', '-plugin-files');
    console.log('🔍 Looking for dependency:', pluginFilesPackageName);
    
    if (!packageJson.dependencies) {
      console.error('❌ No dependencies found in package.json');
      console.error('  Tip: Make sure this is a valid Vibe plugin package');
      process.exit(1);
    }
    
    const depVersion = packageJson.dependencies[pluginFilesPackageName];
    if (!depVersion) {
      console.error('❌ Dependency not found:', pluginFilesPackageName);
      console.error('  Available dependencies:', Object.keys(packageJson.dependencies).join(', '));
      process.exit(1);
    }
    
    console.log('  📌 Raw version:', depVersion);
    
    const version = depVersion
      .replace(/^workspace:/, '')
      .replace(/^https?:\/\/.+\/(.+)\.tar\.gz$/, '$1');
    
    console.log('  📌 Resolved version:', version);
    
    const match = packageJson.name.match(/@wix\/vibe-(.+)-plugin/);
    if (!match) {
      console.error('❌ Could not parse plugin name from:', packageJson.name);
      console.error('  Expected format: @wix/vibe-XXX-plugin');
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
      try {
        const stats = fs.statSync(zipPath);
        console.log('  ✅ Downloaded:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
        console.log('');
        
        console.log('📂 Extracting plugin files...');
        const count = extractZip(zipPath, destDir);
        
        try {
          fs.unlinkSync(zipPath);
        } catch (err) {
          console.warn('  ⚠️  Could not clean up ZIP file:', zipPath);
        }
        
        console.log('  ✅ Total files extracted:', count);
        console.log('');
        console.log('✨ Done! All files extracted to:', destDir);
      } catch (err) {
        console.error('❌ Error processing downloaded file:', err.message);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('❌ Error processing plugin:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

// Main execution
if (pluginSpecifier.startsWith('http')) {
  console.log('📥 Mode: Tarball URL');
  console.log('🌐 Downloading plugin tarball...');
  console.log('  🔗 URL:', pluginSpecifier);
  
  const tgzPath = 'plugin.tgz';
  
  downloadFile(pluginSpecifier, tgzPath, () => {
    try {
      const stats = fs.statSync(tgzPath);
      console.log('  ✅ Downloaded:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
      
      console.log('📦 Extracting tarball...');
      try {
        execSync('tar -xzf ' + tgzPath, { stdio: 'pipe' });
        console.log('  ✅ Tarball extracted');
      } catch (err) {
        console.error('  ❌ Failed to extract tarball:', err.message);
        console.error('  Tip: Make sure tar is installed on your system');
        try { fs.unlinkSync(tgzPath); } catch {}
        process.exit(1);
      }
      
      console.log('📖 Reading package.json...');
      
      let packageJson;
      try {
        packageJson = JSON.parse(fs.readFileSync('package/package.json', 'utf8'));
      } catch (err) {
        console.error('  ❌ Failed to read package.json:', err.message);
        console.error('  Tip: The tarball might not contain a valid package.json');
        try { fs.unlinkSync(tgzPath); } catch {}
        try { fs.rmSync('package', { recursive: true }); } catch {}
        process.exit(1);
      }
      
      try {
        fs.unlinkSync(tgzPath);
        fs.rmSync('package', { recursive: true });
      } catch (err) {
        console.warn('  ⚠️  Could not clean up temporary files');
      }
      
      console.log('  ✅ Package.json loaded');
      console.log('');
      
      processPlugin(packageJson);
    } catch (err) {
      console.error('❌ Unexpected error:', err.message);
      process.exit(1);
    }
  });
} else {
  console.log('📥 Mode: NPM Registry');
  
  const match = pluginSpecifier.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
  if (!match) {
    console.error('❌ Invalid package specifier:', pluginSpecifier);
    console.error('  Expected format: @scope/package@version');
    console.error('  Example: @wix/vibe-stores-plugin@0.8.8');
    process.exit(1);
  }
  
  const packageName = match[1];
  const version = match[2] || 'latest';
  
  console.log('  📦 Package name:', packageName);
  console.log('  📌 Version:', version);
  
  const registryUrl = `https://registry.npmjs.org/${packageName.replace('/', '%2F')}/${version}`;
  
  console.log('🌐 Fetching metadata from npm...');
  console.log('  🔗 URL:', registryUrl);
  
  const request = https.get(registryUrl, (res) => {
    console.log('  ✅ Response status:', res.statusCode);
    
    if (res.statusCode === 404) {
      console.error('  ❌ Package not found:', packageName + '@' + version);
      console.error('  Tip: Check the package name and version');
      process.exit(1);
    }
    
    if (res.statusCode !== 200) {
      console.error('  ❌ Failed to fetch package metadata (status:', res.statusCode + ')');
      process.exit(1);
    }
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('error', (err) => {
      console.error('  ❌ Error reading response:', err.message);
      process.exit(1);
    });
    res.on('end', () => {
      try {
        console.log('  ✅ Metadata received:', (data.length / 1024).toFixed(2), 'KB');
        console.log('');
        
        const packageJson = JSON.parse(data);
        processPlugin(packageJson);
      } catch (err) {
        console.error('  ❌ Failed to parse npm response:', err.message);
        console.error('  Tip: The npm registry might be unavailable');
        process.exit(1);
      }
    });
  });
  
  request.on('error', (err) => {
    console.error('  ❌ Network error:', err.message);
    console.error('  Tip: Check your internet connection');
    process.exit(1);
  });
  
  request.setTimeout(30000, () => {
    request.destroy();
    console.error('  ❌ Request timeout (30s)');
    console.error('  Tip: npm registry might be slow or unavailable');
    process.exit(1);
  });
}
