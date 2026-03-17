import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import {
  simpleGit,
  setRepoData,
  clearRepoData,
  getCurrentBranch
} from '../__fixtures__/simple-git.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('simple-git', () => ({ simpleGit, SimpleGit: {} }))

// Mock fs: we need to control readFileSync, existsSync, writeFileSync, rmSync
const mockRmSync = jest.fn()
const mockWriteFileSync = jest.fn()
const mockExistsSync = jest.fn<(path: string) => boolean>()
const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>()

jest.unstable_mockModule('fs', () => ({
  default: {
    rmSync: mockRmSync,
    writeFileSync: mockWriteFileSync,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync
  },
  rmSync: mockRmSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync
}))

const { run } = await import('../src/main.js')

function setupInputs(inputs: Record<string, string>): void {
  core.getInput.mockImplementation((name: string) => inputs[name] ?? '')
}

function setupLocalFiles(files: Record<string, object>): void {
  mockReadFileSync.mockImplementation((filePath: string) => {
    for (const [key, value] of Object.entries(files)) {
      if (String(filePath).includes(key)) {
        return JSON.stringify(value)
      }
    }
    throw new Error(`File not found in mock: ${filePath}`)
  })
}

function setupRepoFiles(
  repoData: Record<string, Record<string, object | null>>
): void {
  // repoData: { branchName: { fileName: jsonContent | null } }
  const origReadFile = mockReadFileSync.getMockImplementation()

  mockReadFileSync.mockImplementation((filePath: string) => {
    const branch = getCurrentBranch()
    const branchData = repoData[branch]
    if (branchData) {
      for (const [fileName, content] of Object.entries(branchData)) {
        if (String(filePath).includes(fileName)) {
          if (content === null) throw new Error('File not found')
          return JSON.stringify(content)
        }
      }
    }
    // Fall back to original (local files)
    if (origReadFile) return origReadFile(filePath, 'utf-8')
    throw new Error(`File not found in mock: ${filePath}`)
  })

  mockExistsSync.mockImplementation((filePath: string) => {
    const branch = getCurrentBranch()
    const branchData = repoData[branch]
    if (branchData) {
      for (const [fileName, content] of Object.entries(branchData)) {
        if (String(filePath).includes(fileName)) {
          return content !== null
        }
      }
    }
    return false
  })
}

describe('run()', () => {
  const origRunnerTemp = process.env['RUNNER_TEMP']

  beforeEach(() => {
    process.env['RUNNER_TEMP'] = '/tmp/test-runner'
    clearRepoData()
    mockRmSync.mockReset()
    mockWriteFileSync.mockReset()
    mockExistsSync.mockReset()
    mockReadFileSync.mockReset()
  })

  afterEach(() => {
    if (origRunnerTemp !== undefined) {
      process.env['RUNNER_TEMP'] = origRunnerTemp
    } else {
      delete process.env['RUNNER_TEMP']
    }
  })

  it('produces empty matrix when neither CDI nor FDI included', async () => {
    setupInputs({
      'include-cdi': 'false',
      'include-fdi': 'false',
      'github-token': 'test-token'
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'testMatrix',
      JSON.stringify({ include: [{}] })
    )
  })

  it('throws when RUNNER_TEMP is not set', async () => {
    delete process.env['RUNNER_TEMP']
    setupInputs({
      'include-cdi': 'false',
      'include-fdi': 'false',
      'github-token': 'test-token'
    })

    await expect(run()).rejects.toThrow('RUNNER_TEMP is not set')
  })

  it('throws on invalid JSON input', async () => {
    process.env['RUNNER_TEMP'] = '/tmp/test'
    setupInputs({
      'include-cdi': 'false',
      'include-fdi': 'false',
      'github-token': 'test-token',
      'extra-axes': '{bad json'
    })

    await expect(run()).rejects.toThrow("Invalid JSON for input 'extra-axes'")
  })

  it('resolves CDI-only run', async () => {
    setupInputs({
      'include-cdi': 'true',
      'include-fdi': 'false',
      'github-token': 'test-token'
    })

    // Local CDI file
    setupLocalFiles({
      coreDriverInterfaceSupported: { versions: ['5.0', '5.3'] }
    })

    // Upstream supertokens-core repo
    setRepoData('supertokens-core', {
      branches: {
        '11.0': ['5.0'],
        '11.3': ['5.3']
      },
      mainBranch: 'master'
    })

    // Per-branch interface files
    setupRepoFiles({
      '11.0': {
        coreDriverInterfaceSupported: { versions: ['5.0'] }
      },
      '11.3': {
        coreDriverInterfaceSupported: { versions: ['5.3'] }
      },
      master: {
        coreDriverInterfaceSupported: { versions: ['5.3'] }
      }
    })

    await run()

    // Should produce CDI-only matrix cells
    const matrixCall = core.setOutput.mock.calls.find(
      (c) => c[0] === 'testMatrix'
    )
    expect(matrixCall).toBeDefined()
    const matrix = JSON.parse(matrixCall![1] as string)
    expect(matrix.include.length).toBeGreaterThan(0)
    for (const cell of matrix.include) {
      expect(cell).toHaveProperty('cdi-version')
      expect(cell).not.toHaveProperty('fdi-version')
    }

    // Should output coreCdiVersionMap
    const cdiMapCall = core.setOutput.mock.calls.find(
      (c) => c[0] === 'coreCdiVersionMap'
    )
    expect(cdiMapCall).toBeDefined()
  })

  it('resolves FDI-only run', async () => {
    setupInputs({
      'include-cdi': 'false',
      'include-fdi': 'true',
      'github-token': 'test-token',
      'upstream-fdi-repos': '["supertokens-node"]'
    })

    setupLocalFiles({
      frontendDriverInterfaceSupported: { versions: ['4.0', '4.2'] }
    })

    // Branch 20.0 supports only FDI 3.0, branch 21.0 supports 3.0 + 4.0
    // so they each own a different max → two distinct inverse map entries
    setRepoData('supertokens-node', {
      branches: {
        '20.0': ['3.0'],
        '21.0': ['4.0', '4.2']
      },
      mainBranch: 'master'
    })

    setupRepoFiles({
      '20.0': {
        frontendDriverInterfaceSupported: { versions: ['3.0', '4.0'] }
      },
      '21.0': {
        frontendDriverInterfaceSupported: { versions: ['3.0', '4.0', '4.2'] }
      },
      master: {
        frontendDriverInterfaceSupported: { versions: ['3.0', '4.0', '4.2'] }
      }
    })

    await run()

    const matrixCall = core.setOutput.mock.calls.find(
      (c) => c[0] === 'testMatrix'
    )
    expect(matrixCall).toBeDefined()
    const matrix = JSON.parse(matrixCall![1] as string)
    expect(matrix.include.length).toBeGreaterThan(0)
    for (const cell of matrix.include) {
      expect(cell).toHaveProperty('fdi-version')
      expect(cell).not.toHaveProperty('cdi-version')
    }

    const fdiMapCall = core.setOutput.mock.calls.find(
      (c) => c[0] === 'fdiVersionMap'
    )
    expect(fdiMapCall).toBeDefined()

    const fdiVersionsCall = core.setOutput.mock.calls.find(
      (c) => c[0] === 'fdiVersions'
    )
    expect(fdiVersionsCall).toBeDefined()
    const fdiVersions = JSON.parse(fdiVersionsCall![1] as string)
    expect(fdiVersions.length).toBeGreaterThan(0)
  })

  it('outputs extraAxes echoed back', async () => {
    const axes = { py: ['3.8', '3.13'] }
    setupInputs({
      'include-cdi': 'false',
      'include-fdi': 'false',
      'github-token': 'test-token',
      'extra-axes': JSON.stringify(axes)
    })

    await run()

    const axesCall = core.setOutput.mock.calls.find((c) => c[0] === 'extraAxes')
    expect(axesCall).toBeDefined()
    expect(JSON.parse(axesCall![1] as string)).toEqual(axes)
  })
})
