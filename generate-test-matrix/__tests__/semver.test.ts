import { describe, expect, it } from '@jest/globals'
import { parseSemver, cmpSemver, maxOf } from '../src/main.js'

describe('parseSemver', () => {
  it('parses two-part version', () => {
    expect(parseSemver('1.2')).toEqual([1, 2])
  })

  it('parses three-part version', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses zero values', () => {
    expect(parseSemver('0.0.0')).toEqual([0, 0, 0])
  })

  it('parses large numbers', () => {
    expect(parseSemver('12.345')).toEqual([12, 345])
  })
})

describe('cmpSemver', () => {
  it('returns 0 for equal two-part versions', () => {
    expect(cmpSemver('1.2', '1.2')).toBe(0)
  })

  it('returns 0 for equal three-part versions', () => {
    expect(cmpSemver('1.2.3', '1.2.3')).toBe(0)
  })

  it('returns negative when a < b (major)', () => {
    expect(cmpSemver('1.0', '2.0')).toBeLessThan(0)
  })

  it('returns positive when a > b (major)', () => {
    expect(cmpSemver('3.0', '1.0')).toBeGreaterThan(0)
  })

  it('returns negative when a < b (minor)', () => {
    expect(cmpSemver('1.2', '1.3')).toBeLessThan(0)
  })

  it('returns positive when a > b (minor)', () => {
    expect(cmpSemver('1.3', '1.2')).toBeGreaterThan(0)
  })

  it('compares patch versions', () => {
    expect(cmpSemver('1.2.3', '1.2.4')).toBeLessThan(0)
  })

  it('treats missing parts as 0: "1.2" == "1.2.0"', () => {
    expect(cmpSemver('1.2', '1.2.0')).toBe(0)
  })

  it('treats missing parts as 0: "1.2" < "1.2.1"', () => {
    expect(cmpSemver('1.2', '1.2.1')).toBeLessThan(0)
  })

  it('handles double-digit minor correctly: 1.10 > 1.9', () => {
    expect(cmpSemver('1.10', '1.9')).toBeGreaterThan(0)
  })
})

describe('maxOf', () => {
  it('returns the only element for single-element array', () => {
    expect(maxOf(['1.0'])).toBe('1.0')
  })

  it('returns max from already-sorted list', () => {
    expect(maxOf(['1.0', '2.0', '3.0'])).toBe('3.0')
  })

  it('returns max from unsorted list', () => {
    expect(maxOf(['3.0', '1.0', '2.0'])).toBe('3.0')
  })

  it('returns max with patch versions', () => {
    expect(maxOf(['1.0.1', '1.0.3', '1.0.2'])).toBe('1.0.3')
  })

  it('handles mixed two-part and three-part versions', () => {
    expect(maxOf(['1.2', '1.2.1'])).toBe('1.2.1')
  })
})
