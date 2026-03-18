import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { resolveVersions } = await import('../src/main.js')

describe('resolveVersions', () => {
  it('resolves exact match', () => {
    const result = resolveVersions(['2.0'], { '2.0': '2.0' })
    expect(result).toEqual([
      { version: '2.0', branch: '2.0', isExact: true, covers: ['2.0'] }
    ])
  })

  it('falls back to smallest branch whose max >= local version', () => {
    const result = resolveVersions(['1.5'], { '2.0': '2.0', '3.0': '3.0' })
    expect(result).toEqual([
      { version: '2.0', branch: '2.0', isExact: false, covers: ['1.5'] }
    ])
  })

  it('warns and skips versions above all known maxes', () => {
    const result = resolveVersions(['5.0'], { '2.0': '2.0', '3.0': '3.0' })
    expect(result).toEqual([])
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('5.0'))
  })

  it('deduplicates multiple versions mapping to same branch', () => {
    const result = resolveVersions(['1.5', '1.8'], { '2.0': '2.0' })
    expect(result).toHaveLength(1)
    expect(result[0].branch).toBe('2.0')
    expect(result[0].version).toBe('2.0')
    expect(result[0].covers).toEqual(['1.5', '1.8'])
  })

  it('deduplicates exact and fallback to same branch', () => {
    const result = resolveVersions(['2.0', '1.5'], { '2.0': '2.0' })
    expect(result).toHaveLength(1)
    expect(result[0].branch).toBe('2.0')
    expect(result[0].covers).toEqual(expect.arrayContaining(['2.0', '1.5']))
  })

  it('resolves to multiple distinct branches', () => {
    const result = resolveVersions(['1.0', '2.0', '3.0'], {
      '1.0': '1.0',
      '2.0': '2.0',
      '3.0': 'master'
    })
    expect(result).toHaveLength(3)
    expect(result[0].version).toBe('1.0')
    expect(result[1].version).toBe('2.0')
    expect(result[2].version).toBe('3.0')
  })

  it('returns empty array for empty local versions', () => {
    expect(resolveVersions([], { '1.0': '1.0' })).toEqual([])
  })

  it('skips all with warning for empty inverse map', () => {
    const result = resolveVersions(['1.0'], {})
    expect(result).toEqual([])
    expect(core.warning).toHaveBeenCalled()
  })

  it('resolves exact match for gap-filled versions (not any branch max)', () => {
    // Simulates CDI 3.1 added to the inverse map via gap-filling:
    // 3.0 and 4.0 are max-based entries from older branches, while 3.1
    // was gap-filled from a newer branch (9.3) that has it in its
    // supported list but whose max is higher (e.g. 5.1).
    const inverseMap = {
      '3.0': '6.0',
      '3.1': '9.3', // gap-filled
      '4.0': '8.0',
      '5.0': '9.0',
      '5.1': '9.3'
    }
    const result = resolveVersions(['3.1'], inverseMap)
    expect(result).toEqual([
      { version: '3.1', branch: '9.3', isExact: true, covers: ['3.1'] }
    ])
  })

  it('returns results sorted ascending by version', () => {
    const result = resolveVersions(['3.0', '1.0'], {
      '1.0': '1.0',
      '3.0': '3.0'
    })
    expect(result[0].version).toBe('1.0')
    expect(result[1].version).toBe('3.0')
  })
})
