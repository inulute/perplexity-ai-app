const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

function detectOS() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return 'windows';
  } else if (platform === 'darwin') {
    return 'mac';
  } else if (platform === 'linux') {
    // Check if it's Debian-based
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8').toLowerCase();
      if (osRelease.includes('id=debian') || osRelease.includes('id=ubuntu')) {
        return 'debian';
      }
      return 'linux-other';
    } catch (e) {
      return 'linux-other';
    }
  }
  return 'unknown';
}

function runBuild() {
  const detectedOS = detectOS();
  console.log(`Detected OS: ${detectedOS}`);
  
  try {
    switch (detectedOS) {
      case 'windows':
        console.log('Running Windows build...');
        execSync('npm run package-win', { stdio: 'inherit' });
        break;
      case 'mac':
        console.log('Running macOS build...');
        execSync('npm run package-mac', { stdio: 'inherit' });
        break;
      case 'debian':
        console.log('Running Debian/Ubuntu build...');
        execSync('npm run package-linux', { stdio: 'inherit' });
        break;
      case 'linux-other':
        console.log('Running Linux build (AppImage only to avoid fpm issues)...');
        execSync('electron-builder --linux AppImage', { stdio: 'inherit' });
        break;
      default:
        console.error(`Unsupported OS: ${detectedOS}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  }
}

runBuild();
