import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

// Code-native artwork; all installed icons are bundled locally for offline use.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="104" fill="#526852"/>
<path d="M256 164C218 141 166 143 126 156v184c44-13 88-10 130 14 42-24 86-27 130-14V156c-40-13-92-15-130 8Z" fill="#f6f3ec"/>
<path d="M256 166v185" stroke="#526852" stroke-width="9"/>
<path d="M157 195c22-5 44-4 65 2m-65 31c22-5 44-4 65 2m68-33c21-6 43-7 65-2m-65 35c21-6 43-7 65-2" fill="none" stroke="#9ba38a" stroke-width="8" stroke-linecap="round"/>
<path d="M325 102v44l12-8 12 8v-44" fill="#d5c7a9"/>
</svg>`
await mkdir('public/icons', { recursive: true })
await writeFile('public/favicon.svg', icon)
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['apple-touch-icon', 180],
]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(`public/icons/${name}.png`)
}
const maskable = icon.replace('rx="104"', 'rx="0"')
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/maskable-512.png')
