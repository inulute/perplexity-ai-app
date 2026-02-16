const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * After-pack hook for electron-builder to sign packages with GPG
 * This script runs automatically after packages are created
 */
exports.default = async function(context) {
  const { outDir, electronPlatformName } = context;
  
  console.log(`📦 Signing ${electronPlatformName} package...`);
  
  // Get GPG key ID: env var first, then optional build/gpg-key-id.txt (for local builds)
  let GPG_KEY_ID = process.env.GPG_KEY_ID;
  if (!GPG_KEY_ID) {
    const keyFile = path.join(__dirname, 'gpg-key-id.txt');
    if (fs.existsSync(keyFile)) {
      GPG_KEY_ID = fs.readFileSync(keyFile, 'utf8').trim();
    }
  }
  
  if (!GPG_KEY_ID) {
    console.warn('⚠️ No GPG_KEY_ID set (env or build/gpg-key-id.txt), skipping GPG signing');
    return;
  }
  
  try {
    // Find all packages in the output directory
    const files = fs.readdirSync(outDir);
    const packageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.exe', '.msi', '.dmg', '.zip', '.appimage', '.deb'].includes(ext) || 
             file.endsWith('.AppImage');
    });
    
    if (packageFiles.length === 0) {
      console.log('No packages found to sign');
      return;
    }
    
    console.log(`Found ${packageFiles.length} packages to sign`);
    
    const passphrase = process.env.GPG_PASSPHRASE;
    const baseOpts = `--batch --yes --detach-sign --armor --local-user ${GPG_KEY_ID}`;
    const passOpts = passphrase ? '--pinentry-mode loopback --passphrase-fd 0 ' : '';

    // Sign each package
    for (const file of packageFiles) {
      const filePath = path.join(outDir, file);
      console.log(`🔑 Signing ${file} with GPG key ${GPG_KEY_ID}`);
      
      // Create detached signature (passphrase via stdin if GPG_PASSPHRASE set)
      execSync(`gpg ${passOpts}${baseOpts} "${filePath}"`, {
        input: passphrase || undefined,
        stdio: passphrase ? ['pipe', 'inherit', 'inherit'] : 'inherit'
      });
      
      // Verify signature
      execSync(`gpg --verify "${filePath}.asc" "${filePath}"`, {
        stdio: 'inherit'
      });
      
      console.log(`✅ Successfully signed ${file}`);
    }
    
    console.log('✅ GPG signing completed successfully');
  } catch (error) {
    console.error('❌ GPG signing failed:', error);
    console.error(error.message || error);
    // Don't fail the build if signing fails
  }
};