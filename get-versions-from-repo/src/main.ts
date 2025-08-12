import * as core from '@actions/core'
import fs from 'fs'
import { simpleGit, SimpleGit } from 'simple-git'

const cdiFile = 'coreDriverInterfaceSupported.json'
const fdiFile = 'frontendDriverInterfaceSupported.json'
const wjiFile = 'webJsInterfaceSupported.json'

function getInputs() {
  return {
    repo: core.getInput('repo'),
    cdiVersions: JSON.parse(core.getInput('cdi-versions') || '[]'),
    fdiVersions: JSON.parse(core.getInput('fdi-versions') || '[]'),
    wjiVersions: JSON.parse(core.getInput('wji-versions') || '[]')
  }
}

/**
 * Clone the specified repo to a temporary directory and set up sparse checkout
 * to only include the necessary files.
 */
async function setupRepo({
  repoName,
  tempDir
}: {
  repoName: string
  tempDir: string
}): Promise<{ repo: SimpleGit; repoPath: string }> {
  const repoPath = `${tempDir}/${repoName}`

  try {
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch {
    // Ignore errors if the directory does not exist
  }

  await simpleGit().clone(
    `git@github.com:supertokens/${repoName}.git`,
    repoPath,
    ['--no-checkout']
  )

  const repo: SimpleGit = simpleGit({
    baseDir: repoPath
  })

  // Enable sparse checkout
  await repo.addConfig('core.sparseCheckout', 'true')

  // Manually set up sparse checkout to only include the necessary files
  fs.writeFileSync(
    `${repoPath}/.git/info/sparse-checkout`,
    [cdiFile, fdiFile, wjiFile].join('\n')
  )

  return { repo, repoPath }
}

async function getVersions({
  repo,
  repoPath,
  cdiVersions = [],
  fdiVersions = [],
  wjiVersions = []
}: {
  repo: SimpleGit
  repoPath: string
  cdiVersions?: string[]
  fdiVersions?: string[]
  wjiVersions?: string[]
}) {
  // Get the list of remote branches
  const remoteBranches = await repo.branch(['-r'])
  const branches = remoteBranches.all.map((branch) =>
    branch.replace('origin/', '')
  )

  const output = {
    cdi: cdiVersions.reduce(
      (acc, v) => {
        acc[v] = null
        return acc
      },
      {} as Record<string, string | null>
    ),
    fdi: fdiVersions.reduce(
      (acc, v) => {
        acc[v] = null
        return acc
      },
      {} as Record<string, string | null>
    ),
    wji: wjiVersions.reduce(
      (acc, v) => {
        acc[v] = null
        return acc
      },
      {} as Record<string, string | null>
    )
  }

  const versionBranches: string[] = []
  const otherBranches: string[] = []
  branches.forEach((branch) => {
    // Version branches will be `X.Y`
    if (branch.search(/^\d+.\d+$/) === 0) {
      versionBranches.push(branch)
      return
    }

    // Look through other branches to see if they match any interface versions
    // Priority order: versionString, versionString/base, versionString/*
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Object.entries(output).forEach(([_, interfaceMap]) => {
      Object.entries(interfaceMap).forEach(
        ([interfaceVersion, foundVersion]) => {
          if (foundVersion !== null) {
            return
          }

          if (
            branch === interfaceVersion ||
            branch === `${interfaceVersion}/base` ||
            branch.startsWith(`${interfaceVersion}/`)
          ) {
            otherBranches.push(branch)
          }
        }
      )
    })
  })

  // Sort version branches in descending order
  versionBranches.sort((a, b) => parseFloat(b) - parseFloat(a))

  // Checkout each branch and read the required files
  for (const branch of [...versionBranches, ...otherBranches]) {
    await repo.checkout(branch)

    const cdiFilePath = `${repoPath}/${cdiFile}`
    const fdiFilePath = `${repoPath}/${fdiFile}`
    const wjiFilePath = `${repoPath}/${wjiFile}`

    if (fs.existsSync(cdiFilePath)) {
      const supportedVersions =
        JSON.parse(fs.readFileSync(cdiFilePath, 'utf-8'))?.versions || []
      supportedVersions.forEach((version: string) => {
        if (version in output.cdi && output.cdi[version] === null) {
          output.cdi[version] = branch
        }
      })
    }

    if (fs.existsSync(fdiFilePath)) {
      const supportedVersions =
        JSON.parse(fs.readFileSync(fdiFilePath, 'utf-8'))?.versions || []
      supportedVersions.forEach((version: string) => {
        if (version in output.fdi && output.fdi[version] === null) {
          output.fdi[version] = branch
        }
      })
    }

    if (fs.existsSync(wjiFilePath)) {
      const supportedVersion =
        JSON.parse(fs.readFileSync(wjiFilePath, 'utf-8'))?.version || null
      if (
        supportedVersion &&
        supportedVersion in output.wji &&
        output.wji[supportedVersion] === null
      ) {
        output.wji[supportedVersion] = branch
      }
    }
  }

  // Fail if a version is not found
  // Helps reduce the checks we need to add to the GHA workflows
  Object.entries(output).forEach(([interfaceType, interfaceMap]) => {
    Object.entries(interfaceMap).forEach(([interfaceVersion, foundVersion]) => {
      if (foundVersion === null) {
        throw new Error(
          `Could not find branch for ${interfaceType} version: ${interfaceVersion}`
        )
      }
    })
  })

  return output
}

export async function run() {
  const inputs = getInputs()
  // const inputs = {
  //   tempDir: '/Users/namsnath/dev/supertokens/actions/get-versions-from-repo-ts/temp',
  //   repo: 'supertokens-node',
  //   cdiVersions: ["5.3", "5.0", "feat/plugin"],
  //   fdiVersions: ["4.1", "3.0"],
  //   wjiVersions: ["0.11", "0.12"],
  // };

  const tempDir = process.env['RUNNER_TEMP']
  // const tempDir = inputs.tempDir;

  if (tempDir === undefined) {
    throw new Error(
      'RUNNER_TEMP environment variable is not set. Required for setting up the temporary directory.'
    )
  }

  const { repo, repoPath } = await setupRepo({ repoName: inputs.repo, tempDir })
  const output = await getVersions({
    repo,
    repoPath,
    cdiVersions: inputs.cdiVersions,
    fdiVersions: inputs.fdiVersions,
    wjiVersions: inputs.wjiVersions
  })

  core.info(`cdiVersions=${JSON.stringify(output.cdi)}`)
  core.setOutput('cdiVersions', JSON.stringify(output.cdi))

  core.info(`fdiVersions=${JSON.stringify(output.fdi)}`)
  core.setOutput('fdiVersions', JSON.stringify(output.fdi))

  core.info(`webJsInterfaceVersions=${JSON.stringify(output.wji)}`)
  core.setOutput('webJsInterfaceVersions', JSON.stringify(output.wji))
}
