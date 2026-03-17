import { describe, expect, it } from '@jest/globals'
import type { Rep } from '../src/main.js'
import { buildMatrix } from '../src/main.js'

function rep(version: string, branch?: string): Rep {
  return {
    version,
    branch: branch ?? version,
    isExact: true,
    covers: [version]
  }
}

describe('buildMatrix', () => {
  describe('interface-only (no extra axes)', () => {
    it('returns single empty cell when no FDI and no CDI', () => {
      expect(buildMatrix([], [], {}, {}, 'boundary')).toEqual([{}])
    })

    it('returns FDI-only cells when no CDI', () => {
      const result = buildMatrix(
        [rep('1.0'), rep('2.0')],
        [],
        {},
        {},
        'boundary'
      )
      expect(result).toEqual([
        { 'fdi-version': '1.0' },
        { 'fdi-version': '2.0' }
      ])
    })

    it('returns CDI-only cells when no FDI', () => {
      const result = buildMatrix(
        [],
        [rep('3.0'), rep('4.0')],
        {},
        {},
        'boundary'
      )
      expect(result).toEqual([
        { 'cdi-version': '3.0' },
        { 'cdi-version': '4.0' }
      ])
    })

    it('boundary: all FDI x latest CDI + non-latest CDI x latest FDI', () => {
      const result = buildMatrix(
        [rep('1.0'), rep('2.0')],
        [rep('3.0'), rep('4.0')],
        {},
        {},
        'boundary'
      )
      // All FDI x latest CDI (4.0): 2 cells
      // Non-latest CDI (3.0) x latest FDI (2.0): 1 cell
      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { 'fdi-version': '1.0', 'cdi-version': '4.0' },
        { 'fdi-version': '2.0', 'cdi-version': '4.0' },
        { 'fdi-version': '2.0', 'cdi-version': '3.0' }
      ])
    })

    it('primary-full: full cross product', () => {
      const result = buildMatrix(
        [rep('1.0'), rep('2.0')],
        [rep('3.0'), rep('4.0')],
        {},
        {},
        'primary-full'
      )
      expect(result).toHaveLength(4)
      expect(result).toEqual([
        { 'fdi-version': '1.0', 'cdi-version': '3.0' },
        { 'fdi-version': '1.0', 'cdi-version': '4.0' },
        { 'fdi-version': '2.0', 'cdi-version': '3.0' },
        { 'fdi-version': '2.0', 'cdi-version': '4.0' }
      ])
    })

    it('boundary with single FDI and single CDI', () => {
      const result = buildMatrix([rep('1.0')], [rep('2.0')], {}, {}, 'boundary')
      expect(result).toEqual([{ 'fdi-version': '1.0', 'cdi-version': '2.0' }])
    })

    it('boundary with multiple FDI and single CDI', () => {
      const result = buildMatrix(
        [rep('1.0'), rep('2.0'), rep('3.0')],
        [rep('5.0')],
        {},
        {},
        'boundary'
      )
      // All FDI x latest CDI (5.0): 3 cells. No non-latest CDI.
      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { 'fdi-version': '1.0', 'cdi-version': '5.0' },
        { 'fdi-version': '2.0', 'cdi-version': '5.0' },
        { 'fdi-version': '3.0', 'cdi-version': '5.0' }
      ])
    })

    it('boundary with single FDI and multiple CDI', () => {
      const result = buildMatrix(
        [rep('1.0')],
        [rep('3.0'), rep('4.0'), rep('5.0')],
        {},
        {},
        'boundary'
      )
      // All FDI (1.0) x latest CDI (5.0): 1 cell
      // Non-latest CDI (3.0, 4.0) x latest FDI (1.0): 2 cells
      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { 'fdi-version': '1.0', 'cdi-version': '5.0' },
        { 'fdi-version': '1.0', 'cdi-version': '3.0' },
        { 'fdi-version': '1.0', 'cdi-version': '4.0' }
      ])
    })
  })

  describe('extra axes', () => {
    it('appends single extra axis with single value to every cell', () => {
      const result = buildMatrix(
        [rep('1.0')],
        [],
        { py: ['3.13'] },
        {},
        'boundary'
      )
      expect(result).toEqual([{ 'fdi-version': '1.0', py: '3.13' }])
    })

    it('sweeps extra axis values only on the latest interface cell', () => {
      const result = buildMatrix(
        [rep('1.0'), rep('2.0')],
        [],
        { py: ['3.8', '3.13'] },
        {},
        'boundary'
      )
      // Non-latest (1.0) gets only anchor py=3.13
      // Latest (2.0) gets anchor py=3.13 + sweep py=3.8
      expect(result).toEqual([
        { 'fdi-version': '1.0', py: '3.13' },
        { 'fdi-version': '2.0', py: '3.13' },
        { 'fdi-version': '2.0', py: '3.8' }
      ])
    })

    it('sweeps two extra axes independently on latest cell', () => {
      const result = buildMatrix(
        [rep('2.0')],
        [],
        { py: ['3.8', '3.13'], fw: ['fastapi', 'flask'] },
        {},
        'boundary'
      )
      // Single interface cell (latest), anchor is py=3.13 + fw=flask
      // Sweep py: 3.8 (fw stays flask)
      // Sweep fw: fastapi (py stays 3.13)
      expect(result).toHaveLength(3)
      expect(result).toContainEqual({
        'fdi-version': '2.0',
        py: '3.13',
        fw: 'flask'
      })
      expect(result).toContainEqual({
        'fdi-version': '2.0',
        py: '3.8',
        fw: 'flask'
      })
      expect(result).toContainEqual({
        'fdi-version': '2.0',
        py: '3.13',
        fw: 'fastapi'
      })
    })

    it('respects latest-extra override', () => {
      const result = buildMatrix(
        [rep('1.0'), rep('2.0')],
        [],
        { py: ['3.8', '3.13'] },
        { py: '3.8' },
        'boundary'
      )
      // Anchor is py=3.8 (overridden). Non-latest gets py=3.8.
      // Latest sweeps py=3.13.
      expect(result).toEqual([
        { 'fdi-version': '1.0', py: '3.8' },
        { 'fdi-version': '2.0', py: '3.8' },
        { 'fdi-version': '2.0', py: '3.13' }
      ])
    })

    it('applies extra axes to empty base cell when no interfaces', () => {
      const result = buildMatrix(
        [],
        [],
        { py: ['3.8', '3.13'] },
        {},
        'boundary'
      )
      // Base is [{}], which counts as latest. Sweep applies.
      expect(result).toHaveLength(2)
      expect(result).toContainEqual({ py: '3.13' })
      expect(result).toContainEqual({ py: '3.8' })
    })

    it('deduplicates identical cells', () => {
      // With a single extra axis value, the anchor and sweep produce the same cell
      const result = buildMatrix(
        [rep('1.0')],
        [],
        { py: ['3.13'] },
        {},
        'boundary'
      )
      expect(result).toHaveLength(1)
    })
  })
})
