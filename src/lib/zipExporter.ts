/**
 * Simple in-browser zip creator (Store mode, uncompressed)
 * Spec-compliant PKZip generator using ArrayBuffers and Uint8Array.
 * Perfect for bundling JSON, CSV and binary files without external dependencies.
 */

// CRC-32 lookup table
const crc32Table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crc32Table[i] = c
}

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array | string
}

export function createZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const localHeaders: Uint8Array[] = []
  const centralDirs: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const rawData = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data
    const nameBytes = encoder.encode(entry.name.replace(/\\/g, '/'))
    const crc = calculateCrc32(rawData)
    const size = rawData.length

    // Local file header (30 bytes + name length)
    const lh = new Uint8Array(30 + nameBytes.length)
    const lhView = new DataView(lh.buffer)

    lhView.setUint32(0, 0x04034b50, true) // Signature
    lhView.setUint16(4, 20, true) // Version needed (2.0)
    lhView.setUint16(6, 0x0800, true) // Flags (UTF-8 enabled)
    lhView.setUint16(8, 0, true) // Compression method: 0 (store)
    lhView.setUint16(10, 0, true) // Mod time
    lhView.setUint16(12, 0, true) // Mod date
    lhView.setUint32(14, crc, true) // CRC-32
    lhView.setUint32(18, size, true) // Compressed size
    lhView.setUint32(22, size, true) // Uncompressed size
    lhView.setUint16(26, nameBytes.length, true) // File name length
    lhView.setUint16(28, 0, true) // Extra field length

    lh.set(nameBytes, 30)

    localHeaders.push(lh)
    localHeaders.push(rawData)

    // Central directory header (46 bytes + name length)
    const cd = new Uint8Array(46 + nameBytes.length)
    const cdView = new DataView(cd.buffer)

    cdView.setUint32(0, 0x02014b50, true) // Signature
    cdView.setUint16(4, 20, true) // Version made by
    cdView.setUint16(6, 20, true) // Version needed
    cdView.setUint16(8, 0x0800, true) // Flags (UTF-8)
    cdView.setUint16(10, 0, true) // Compression method: 0
    cdView.setUint16(12, 0, true) // Mod time
    cdView.setUint16(14, 0, true) // Mod date
    cdView.setUint32(16, crc, true) // CRC-32
    cdView.setUint32(20, size, true) // Compressed size
    cdView.setUint32(24, size, true) // Uncompressed size
    cdView.setUint16(28, nameBytes.length, true) // Name length
    cdView.setUint16(30, 0, true) // Extra length
    cdView.setUint16(32, 0, true) // Comment length
    cdView.setUint16(34, 0, true) // Disk #
    cdView.setUint16(36, 0, true) // Internal attrs
    cdView.setUint32(38, 0, true) // External attrs
    cdView.setUint32(42, offset, true) // Relative offset of local header

    cd.set(nameBytes, 46)
    centralDirs.push(cd)

    offset += lh.length + size
  }

  const centralDirSize = centralDirs.reduce((acc, b) => acc + b.length, 0)

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)

  eocdView.setUint32(0, 0x06054b50, true) // Signature
  eocdView.setUint16(4, 0, true) // Number of this disk
  eocdView.setUint16(6, 0, true) // Disk with central dir
  eocdView.setUint16(8, entries.length, true) // Entries on this disk
  eocdView.setUint16(10, entries.length, true) // Total entries
  eocdView.setUint32(12, centralDirSize, true) // Size of central dir
  eocdView.setUint32(16, offset, true) // Offset of start of central dir
  eocdView.setUint16(20, 0, true) // Comment length

  return new Blob([...localHeaders, ...centralDirs, eocd] as BlobPart[], {
    type: 'application/zip',
  })
}
