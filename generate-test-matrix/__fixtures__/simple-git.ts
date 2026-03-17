import { jest } from '@jest/globals'

export type BranchData = {
  branches: Record<string, string[]>
  mainBranch?: string
}

const repoStore: Record<string, BranchData> = {}

export function setRepoData(repoName: string, data: BranchData): void {
  repoStore[repoName] = data
}

export function clearRepoData(): void {
  for (const key of Object.keys(repoStore)) {
    delete repoStore[key]
  }
}

let currentBranch = ''
let currentRepoName = ''

const mockRepo = {
  addConfig: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  branch: jest
    .fn<() => Promise<{ all: string[] }>>()
    .mockImplementation(async () => {
      const data = repoStore[currentRepoName]
      if (!data) return { all: [] }
      const all = [
        ...Object.keys(data.branches).map((b) => `origin/${b}`),
        ...(data.mainBranch ? [`origin/${data.mainBranch}`] : [])
      ]
      return { all }
    }),
  checkout: jest
    .fn<(branch: string) => Promise<void>>()
    .mockImplementation(async (branch: string) => {
      currentBranch = branch
    })
}

const mockGit = {
  clone: jest
    .fn<(url: string, localPath: string, options?: string[]) => Promise<void>>()
    .mockImplementation(async (url: string) => {
      const match = url.match(/supertokens\/([^.]+)\.git/)
      if (match) currentRepoName = match[1]
    })
}

export function simpleGit(opts?: { baseDir?: string }) {
  if (opts?.baseDir) return mockRepo
  return mockGit
}

export function getCurrentBranch(): string {
  return currentBranch
}

export function getCurrentRepoName(): string {
  return currentRepoName
}

export function getMockRepo(): typeof mockRepo {
  return mockRepo
}

export function getMockGit(): typeof mockGit {
  return mockGit
}
