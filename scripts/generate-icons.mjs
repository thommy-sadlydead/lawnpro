/**
 * PWA Icon Generator for LawnPro
 * Generates all required PNG icons from an SVG source using sharp.
 *
 * Run: node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/icons')

mkdirSync(OUT_DIR, { recursive: true })

// LawnPro icon SVG — green rounded square with white "LP" monogram
// The safe zone for maskable icons is the center 80% of the image.
// All meaningful content stays in the inner 80%, with a solid green bg covering full bleed.
const buildSvg = (size, maskable = false) => {
  const pad = maskable ? size * 0.1 : size * 0.18  // maskable needs more padding
  const radius = maskable ? size * 0.0 : size * 0.22 // no rounding for maskable (full bleed)
  const innerSize = size - pad * 2
  const leafSize = innerSize * 0.55
  const cx = size / 2
  const cy = size / 2

  // Leaf SVG path scaled to leafSize, centered at (cx, cy)
  // Simple stylized leaf / blade of grass icon
  const s = leafSize / 100
  const tx = cx - leafSize / 2
  const ty = cy - leafSize / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <clipPath id="clip">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/>
    </clipPath>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#16a34a"/>
  <!-- Subtle gradient overlay -->
  <defs>
    <radialGradient id="grd" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#22c55e" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#14532d" stop-opacity="0.3"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#grd)"/>
  <!-- Leaf icon group, clipped -->
  <g clip-path="url(#clip)" transform="translate(${tx}, ${ty}) scale(${s})">
    <!-- Main leaf blade -->
    <path d="M 50 95 C 50 95 15 70 15 35 C 15 10 35 5 50 5 C 65 5 85 10 85 35 C 85 70 50 95 50 95 Z"
      fill="white" opacity="0.92"/>
    <!-- Center vein -->
    <line x1="50" y1="90" x2="50" y2="20" stroke="#16a34a" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
    <!-- Left vein -->
    <line x1="50" y1="65" x2="25" y2="45" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" opacity="0.35"/>
    <!-- Right vein -->
    <line x1="50" y1="65" x2="75" y2="45" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" opacity="0.35"/>
  </g>
</svg>`
}

// Sizes to generate
const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512]

async function generateIcon(size, maskable = false) {
  const suffix = maskable ? '-maskable' : ''
  const filename = `icon-${size}${suffix}.png`
  const outPath = join(OUT_DIR, filename)
  const svg = buildSvg(size, maskable)

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath)

  console.log(`✓  ${filename}`)
}

async function main() {
  console.log('Generating LawnPro PWA icons...\n')

  // Regular icons
  for (const size of SIZES) {
    await generateIcon(size, false)
  }

  // Maskable icon (512 only — used by Android adaptive icons)
  await generateIcon(512, true)

  // Apple touch icon (180px, same as icon-180.png but named conventionally)
  const appleIconSvg = buildSvg(180, false)
  await sharp(Buffer.from(appleIconSvg))
    .png()
    .toFile(join(OUT_DIR, 'apple-touch-icon.png'))
  console.log('✓  apple-touch-icon.png')

  // favicon-32.png for <link rel="icon">
  await sharp(Buffer.from(buildSvg(32, false))).png().toFile(join(OUT_DIR, 'favicon-32.png'))
  console.log('✓  favicon-32.png')

  console.log('\nAll icons generated in public/icons/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
