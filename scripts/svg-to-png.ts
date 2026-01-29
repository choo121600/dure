/**
 * Convert SVG screenshots to PNG for GitHub README
 *
 * Usage:
 *   npx tsx scripts/svg-to-png.ts                    # Convert all SVGs
 *   npx tsx scripts/svg-to-png.ts output_.svg        # Convert specific file
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const SCREENSHOTS_DIR = join(import.meta.dirname, '../docs/images/cli');

async function convertSvgToPng(svgPath: string): Promise<string> {
  const svgContent = readFileSync(svgPath, 'utf-8');

  // Extract viewBox dimensions
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) {
    throw new Error(`No viewBox found in ${svgPath}`);
  }

  const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
  const width = parts[2];  // viewBox format: minX, minY, width, height
  const height = parts[3];

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport to match SVG dimensions
  await page.setViewportSize({
    width: Math.ceil(width) + 32,
    height: Math.ceil(height) + 32,
  });

  // Create HTML with SVG embedded
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; }
        body {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          padding: 16px;
        }
        svg {
          display: block;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  await page.setContent(html);

  // Generate PNG path
  const pngPath = svgPath.replace(/\.svg$/, '.png');

  await page.screenshot({
    path: pngPath,
    omitBackground: true,
  });

  await browser.close();

  return pngPath;
}

async function main() {
  const args = process.argv.slice(2);

  let filesToConvert: string[] = [];

  if (args.length > 0) {
    // Convert specific files
    filesToConvert = args.map((f) => {
      if (f.startsWith('/')) return f;
      if (existsSync(join(SCREENSHOTS_DIR, f))) return join(SCREENSHOTS_DIR, f);
      return f;
    });
  } else {
    // Convert all SVGs in the directory
    if (!existsSync(SCREENSHOTS_DIR)) {
      console.error(`Directory not found: ${SCREENSHOTS_DIR}`);
      process.exit(1);
    }

    filesToConvert = readdirSync(SCREENSHOTS_DIR)
      .filter((f) => f.endsWith('.svg') && !f.startsWith('.'))
      .map((f) => join(SCREENSHOTS_DIR, f));
  }

  console.log(`Converting ${filesToConvert.length} SVG files to PNG...\n`);

  for (const svgPath of filesToConvert) {
    try {
      const pngPath = await convertSvgToPng(svgPath);
      console.log(`  + ${basename(pngPath)}`);
    } catch (err) {
      console.error(`  x ${basename(svgPath)}: ${(err as Error).message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
