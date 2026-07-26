import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

const expected = new Map([
  ['store/assets/logo-300.png', [300, 300]],
  ['store/assets/options-general-1280x800.png', [1280, 800]],
  ['store/assets/promo-small-440x280.png', [440, 280]],
])
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

for (const [path, [expectedWidth, expectedHeight]] of expected) {
  const image = await readFile(path)
  if (!image.subarray(0, 8).equals(pngSignature) || image.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${path}: expected a PNG with an IHDR header`)
  }
  const width = image.readUInt32BE(16)
  const height = image.readUInt32BE(20)
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `${path}: expected ${expectedWidth}x${expectedHeight}, received ${width}x${height}`,
    )
  }
}

process.stdout.write('Store asset PNG formats and dimensions validated.\n')
