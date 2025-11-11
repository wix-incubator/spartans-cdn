#!/usr/bin/env node

/**
 * Install Plugin Files
 * 
 * Installs plugin files from a Vibe plugin package.
 * 
 * This script:
 * 1. Accepts either an npm package specifier (@wix/vibe-stores-plugin@0.8.8) 
 *    OR a tarball URL (from GitHub/CDN)
 * 2. Fetches the plugin's package.json to determine the plugin-files version
 * 3. Downloads the plugin-files ZIP from the CDN
 * 4. Extracts all files to the specified destination directory
 * 
 * Dependencies: NONE (pure Node.js built-ins only)
 * - Uses built-in https/http for downloads
 * - Uses built-in tar command for tarball extraction
 * - Implements custom ZIP parser (no external libs needed)
 * 
 * Usage:
 *   # From npm registry
 *   node install-plugin-files.js @wix/vibe-stores-plugin@0.8.8 ./output
 * 
 *   # From tarball URL
 *   node install-plugin-files.js https://github.com/.../plugin.tar.gz ./output
 * 
 * Arguments:
 *   1. Plugin specifier - npm package (@scope/name@version) or tarball URL
 *   2. Destination directory - where to extract plugin files
 * 
 * @author Vibe Plugins Team
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const [pluginSpecifier, destDir] = process.argv.slice(2);

if (!pluginSpecifier || !destDir) {
  console.error('❌ Error: Plugin specifier and destination directory are required');
  console.error('Usage: node install-plugin-files.js <package@version|tarball-url> <dest-dir>');
  console.error('Example: node install-plugin-files.js @wix/vibe-stores-plugin@0.8.8 ./output');
  process.exit(1);
}

console.log('🚀 Starting plugin files download...');
console.log('📦 Plugin:', pluginSpecifier);
console.log('📁 Destination:', destDir);
console.log('');

/**
 * Download a file from a URL, following redirects
 * @param {string} url - The URL to download from
 * @param {string} outputPath - Where to save the file
 * @param {function} callback - Called when download completes
 */
function downloadFile(url, outputPath, callback) {
  const client = url.startsWith('https') ? https : http;
  
  client.get(url, (res) => {
    // Handle redirects
    if (res.statusCode === 301 || res.statusCode === 302) {
      console.log('  ↪️  Following redirect:', res.headers.location);
      return downloadFile(res.headers.location, outputPath, callback);
    }
    
    console.log('  ✅ Response status:', res.statusCode);
    
    // Pipe response to file
    res.pipe(fs.createWriteStream(outputPath)).on('finish', callback);
  }).on('error', (err) => {
    console.error('  ❌ Download error:', err.message);
    process.exit(1);
  });
}

/**
 * Extract a ZIP file using custom pure Node.js parser
 * @param {string} zipPath - Path to the ZIP file
 * @param {string} destDir - Destination directory
 * @returns {number} Number of files extracted
 */
function extractZip(zipPath, destDir) {
  console.log('  📖 Reading ZIP file...');
  const buf = fs.readFileSync(zipPath);
  console.log('  📊 ZIP size:', buf.length, 'bytes');
  
  console.log('  🔍 Locating Central Directory...');
  
  // Find End of Central Directory Record (EOCD)
  // Signature: 0x06054b50
  let i = buf.length - 22; // EOCD is at least 22 bytes
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) {
    i--;
  }
  
  if (i < 0) {
    console.error('  ❌ Invalid ZIP file - EOCD not found');
    process.exit(1);
  }
  
  // Read EOCD fields
  const cdSize = buf.readUInt32LE(i + 12);   // Size of central directory
  const cdOffset = buf.readUInt32LE(i + 16); // Offset of central directory
  
  console.log('  ✅ Central Directory found at offset:', cdOffset);
  
  let pos = cdOffset;
  let count = 0;
  
  console.log('  📂 Extracting files...');
  
  // Parse Central Directory entries
  while (pos < cdOffset + cdSize) {
    // Check for Central Directory File Header signature: 0x02014b50
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      break;
    }
    
    // Read file header fields
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const offset = buf.readUInt32LE(pos + 42); // Offset to local file header
    const fname = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    
    // Skip directories
    if (fname[fname.length - 1] !== '/') {
      // Read Local File Header
      const lfhPos = offset;
      const cSize = buf.readUInt32LE(lfhPos + 18);        // Compressed size
      const fNameLen = buf.readUInt16LE(lfhPos + 26);
      const fExtraLen = buf.readUInt16LE(lfhPos + 28);
      const dataPos = lfhPos + 30 + fNameLen + fExtraLen; // Start of file data
      
      // Remove the first directory component (e.g., "picasso-stores-plugin-files/")
      const relativePath = fname.replace(/^[^\/]+\//, '');
      const outPath = path.join(destDir, relativePath);
      
      // Create directory structure
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      
      // Write file (assuming stored or deflate - works for most cases)
      fs.writeFileSync(outPath, buf.slice(dataPos, dataPos + cSize));
      
      count++;
      
      // Log every file extracted
      console.log('    ✓', relativePath);
    }
    
    // Move to next entry
    pos += 46 + nameLen + extraLen + commentLen;
  }
  
  return count;
}

/**
 * Process the plugin package.json and download plugin-files
 * @param {object} packageJson - The plugin's package.json
 */
function processPlugin(packageJson) {
  console.log('✅ Plugin found:', packageJson.name + '@' + packageJson.version);
  console.log('');
  
  // Determine plugin-files package name
  const pluginFilesPackageName = packageJson.name.replace('-plugin', '-plugin-files');
  
  console.log('🔍 Looking for dependency:', pluginFilesPackageName);
  
  const depVersion = packageJson.dependencies[pluginFilesPackageName];
  
  if (!depVersion) {
    console.error('❌ Dependency not found in package.json');
    process.exit(1);
  }
  
  console.log('  📌 Raw version:', depVersion);
  
  // Parse version (handle workspace:, tarball URLs, or regular versions)
  let version = depVersion
    .replace(/^workspace:/, '')
    .replace(/^https?:\/\/.+\/(.+)\.tar\.gz$/, '$1');
  
  console.log('  📌 Resolved version:', version);
  
  // Extract short plugin name (e.g., "stores" from "@wix/vibe-stores-plugin")
  const match = packageJson.name.match(/@wix\/vibe-(.+)-plugin/);
  if (!match) {
    console.error('❌ Could not parse plugin name');
    process.exit(1);
  }
  
  const shortName = match[1];
  console.log('  📌 Plugin short name:', shortName);
  
  // Build plugin-files ZIP URL
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
    
    // Clean up ZIP file
    fs.unlinkSync(zipPath);
    
    console.log('  ✅ Total files extracted:', count);
    console.log('');
    console.log('✨ Done! All files extracted to:', destDir);
  });
}

// Main execution
if (pluginSpecifier.startsWith('http')) {
  // Mode: Tarball URL
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
      console.error('  ❌ Failed to extract tarball:', err.message);
      fs.unlinkSync(tgzPath);
      process.exit(1);
    }
    
    console.log('📖 Reading package.json...');
    const packageJson = JSON.parse(fs.readFileSync('package/package.json', 'utf8'));
    
    // Clean up
    fs.unlinkSync(tgzPath);
    fs.rmSync('package', { recursive: true });
    
    console.log('  ✅ Package.json loaded');
    console.log('');
    
    processPlugin(packageJson);
  });
} else {
  // Mode: NPM Registry
  console.log('📥 Mode: NPM Registry');
  
  // Parse package specifier (e.g., @wix/vibe-stores-plugin@0.8.8)
  const match = pluginSpecifier.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
  
  if (!match) {
    console.error('❌ Invalid package specifier');
    process.exit(1);
  }
  
  const packageName = match[1];
  const version = match[2] || 'latest';
  
  console.log('  📦 Package name:', packageName);
  console.log('  📌 Version:', version);
  
  // Build npm registry URL
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

