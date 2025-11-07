#!/usr/bin/env node

/**
 * Simple test to verify library structure
 * This tests that the module files are properly structured
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libDir = path.join(__dirname, 'public', 'assets', 'js', 'lib');

console.log('Testing SimpleRecordRTC Library Structure...\n');

// Check that all expected files exist
const expectedFiles = [
    'index.js',
    'LiveWaveform.js',
    'AccumulatedWaveform.js',
    'RecordingManager.js',
    'AudioProcessor.js',
    'README.md'
];

let allFilesExist = true;

expectedFiles.forEach(file => {
    const filePath = path.join(libDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`✓ ${file} exists`);
    } else {
        console.log(`✗ ${file} is missing`);
        allFilesExist = false;
    }
});

console.log('\n');

// Check that files contain export statements
const moduleFiles = expectedFiles.filter(f => f.endsWith('.js'));

moduleFiles.forEach(file => {
    const filePath = path.join(libDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('export')) {
        console.log(`✓ ${file} contains export statements`);
    } else {
        console.log(`✗ ${file} missing export statements`);
    }
});

console.log('\n');

// Check package.json
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
    console.log('✓ package.json exists');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(`  - Package name: ${pkg.name}`);
    console.log(`  - Version: ${pkg.version}`);
    console.log(`  - Type: ${pkg.type}`);
    console.log(`  - Main entry: ${pkg.main}`);
} else {
    console.log('✗ package.json is missing');
}

console.log('\n');

if (allFilesExist) {
    console.log('✅ All library structure tests passed!');
} else {
    console.log('❌ Some tests failed');
    process.exit(1);
}
