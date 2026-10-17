import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { decodeSongBytes } from './decode'

describe('decodeSongBytes', () => {
  it('reads UTF-8, with or without a BOM', () => {
    const text = 'Perché è così'
    assert.equal(decodeSongBytes(new TextEncoder().encode(text)), text)
    assert.equal(decodeSongBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])), text)
  })

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    // «Città già» in Windows-1252: à is 0xE0.
    const bytes = new Uint8Array([0x43, 0x69, 0x74, 0x74, 0xe0, 0x20, 0x67, 0x69, 0xe0])
    assert.equal(decodeSongBytes(bytes), 'Città già')
  })

  it('reads a UTF-16 file with its BOM, and never leaves a NUL', () => {
    const units = [...'[C]la'].flatMap((char) => [char.charCodeAt(0), 0])
    assert.equal(decodeSongBytes(new Uint8Array([0xff, 0xfe, ...units])), '[C]la')
    assert.equal(decodeSongBytes(new Uint8Array([0x61, 0x00, 0x62])), 'ab')
  })
})
