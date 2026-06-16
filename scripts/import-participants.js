#!/usr/bin/env node
/**
 * Import participants from a Markdown (.md) or text file.
 *
 * Expected format (pipe-separated):
 *   No Peserta | Full Name | Gender (L/P)
 *   001 | John Doe | L
 *   002 | Jane Doe | P
 *
 * Usage: node scripts/import-participants.js <filepath>
 *
 * For PDF files, install pdf-parse and this script will extract text automatically.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function importFromText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  let imported = 0;
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;

    const [num, name, gender] = parts;
    if (num.toLowerCase().includes('no') || num === '---') continue;

    const g = gender.toUpperCase();
    if (g !== 'L' && g !== 'P') continue;

    try {
      const existing = await User.findOne({ participantNumber: num });
      if (existing) {
        console.log(`  Skipped: ${num} (already exists)`);
        skipped++;
        continue;
      }
      await User.create({ participantNumber: num, fullName: name, gender: g });
      console.log(`  Imported: ${num} - ${name} (${g})`);
      imported++;
    } catch (e) {
      console.error(`  Error: ${num} - ${e.message}`);
      skipped++;
    }
  }

  return { imported, skipped };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-participants.js <filepath>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  await connectDB();

  const ext = path.extname(absPath).toLowerCase();
  let text;

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(absPath);
      const pdfData = await pdfParse(dataBuffer);
      text = pdfData.text;
    } catch (e) {
      console.error('Failed to parse PDF. Ensure pdf-parse is installed.');
      process.exit(1);
    }
  } else {
    text = fs.readFileSync(absPath, 'utf-8');
  }

  console.log('\nImporting participants...\n');
  const { imported, skipped } = await importFromText(text);
  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);

  await mongoose.disconnect();
  process.exit(0);
}

main();
