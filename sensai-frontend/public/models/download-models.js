// This script downloads the required face-api.js models
// Run with: node public/models/download-models.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pipeline = promisify(stream.pipeline);

const models = [
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/tiny_face_detector_model-weights_manifest.json',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/tiny_face_detector_model-shard1',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_model-weights_manifest.json',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_model-shard1',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_tiny_model-weights_manifest.json',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_tiny_model-shard1',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-weights_manifest.json',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-shard1',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-shard2',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_expression_model-weights_manifest.json',
  'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_expression_model-shard1',
];

// Create models directory if it doesn't exist
const modelsDir = path.join(__dirname, '..', 'public', 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Use a downloader that follows redirects
const downloadFile = (url, outputPath) => {
  console.log(`Downloading ${url} to ${outputPath}`);
  
  try {
    // Use curl which handles redirects better
    execSync(`curl -L -o "${outputPath}" "${url}"`, { stdio: 'inherit' });
    console.log(`Downloaded ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.error(`Error downloading ${url}:`, error.message);
    return false;
  }
};

async function main() {
  let success = true;
  
  for (const modelUrl of models) {
    const fileName = path.basename(modelUrl);
    const outputPath = path.join(modelsDir, fileName);
    
    // Skip if file already exists
    if (fs.existsSync(outputPath)) {
      console.log(`Skipping ${fileName} - already exists`);
      continue;
    }
    
    const result = downloadFile(modelUrl, outputPath);
    if (!result) {
      console.error(`Failed to download ${fileName}`);
      success = false;
    }
  }
  
  if (success) {
    console.log('All models downloaded successfully!');
  } else {
    console.error('Some models failed to download. Please check the logs above.');
    process.exit(1);
  }
}

main().catch(console.error);
