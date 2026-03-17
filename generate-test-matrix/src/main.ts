import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'
import { simpleGit, SimpleGit } from 'simple-git'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Rep = {
  version: string
  branch: string
  isExact: boolean
  covers: string[]
}

export type InverseMap = Record<string, string>
export type MatrixCell = Record<string, string>

// ---------------------------------------------------------------------------
// Semver helpers (handles X.Y and X.Y.Z)
// ---------------------------------------------------------------------------

export function parseSemver(v: string): number[] {
  return String(v).split('.').map(Number)
}

export function cmpSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function maxOf(versions: string[]): string {
  return [...versions].sort(cmpSemver).at(-1) as string
}

// ---------------------------------------------------------------------------
// Repo setup (sparse checkout, single interface file)
// ---------------------------------------------------------------------------

function authHeader(githubToken: string): string {
  const basic = Buffer.from(`x-access-token:${githubToken}`).toString('base64')
  return `AUTHORIZATION: basic ${basic}`
}

async function setupRepo(
  repoName: string,
  interfaceFile: string,
  githubToken: string,
  tempDir: string
): Promise<{ repo: SimpleGit; repoPath: string }> {
  const repoPath = path.join(tempDir, `generate-matrix-${repoName}`)

  try {
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch {
    // ignore
  }

  await simpleGit().clone(
    `https://github.com/supertokens/${repoName}.git`,
    repoPath,
    [
      '--no-checkout',
      '-c',
      `http.https://github.com/.extraheader=${authHeader(githubToken)}`
    ]
  )

  const repo = simpleGit({ baseDir: repoPath })
  await repo.addConfig('core.sparseCheckout', 'true')
  fs.writeFileSync(
    path.join(repoPath, '.git', 'info', 'sparse-checkout'),
    interfaceFile
  )

  return { repo, repoPath }
}

// ---------------------------------------------------------------------------
// Build inverse map: { max_interface_version → branch }
//
// For each X.Y version branch (plus master/main), read the interface file and
// find its maximum supported version. That branch "owns" that interface era.
// If two branches share the same max, the highest branch wins (it's newer).
// ---------------------------------------------------------------------------

async function buildInverseMap(
  repoName: string,
  interfaceFile: string,
  githubToken: string,
  tempDir: string
): Promise<InverseMap> {
  core.info(`\nScanning ${repoName} (${interfaceFile})...`)

  const { repo, repoPath } = await setupRepo(
    repoName,
    interfaceFile,
    githubToken,
    tempDir
  )

  const remoteBranches = await repo.branch(['-r'])
  const branches = remoteBranches.all.map((b) => b.replace('origin/', ''))

  const versionBranches = branches
    .filter((b) => /^\d+\.\d+$/.test(b))
    .sort(cmpSemver)
  const mainBranch =
    branches.find((b) => b === 'master') ?? branches.find((b) => b === 'main')
  const toCheck = [...versionBranches, ...(mainBranch ? [mainBranch] : [])]

  core.info(
    `  Checking ${toCheck.length} branches: ${toCheck.slice(0, 5).join(', ')}${toCheck.length > 5 ? ', ...' : ''}`
  )

  const inverseMap: InverseMap = {}

  for (const branch of toCheck) {
    try {
      await repo.checkout(branch)
    } catch {
      continue
    }

    const filePath = path.join(repoPath, interfaceFile)
    if (!fs.existsSync(filePath)) continue

    let versions: string[]
    try {
      versions =
        (
          JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
            versions?: string[]
          }
        ).versions ?? []
    } catch {
      continue
    }
    if (versions.length === 0) continue

    const max = maxOf(versions)
    const isVersionBranch = /^\d+\.\d+$/.test(branch)
    const existingIsVersion =
      max in inverseMap && /^\d+\.\d+$/.test(inverseMap[max])

    if (!(max in inverseMap)) {
      inverseMap[max] = branch
    } else if (isVersionBranch && existingIsVersion) {
      // Both are version branches — highest wins
      if (cmpSemver(branch, inverseMap[max]) > 0) {
        inverseMap[max] = branch
      }
    } else if (isVersionBranch && !existingIsVersion) {
      // Prefer version branch over main/master
      inverseMap[max] = branch
    }
    // else: keep existing (version branch or first-seen main/master)
  }

  const sortedEntries = Object.entries(inverseMap).sort(([a], [b]) =>
    cmpSemver(a, b)
  )
  core.info(`  Inverse map (max_interface → branch):`)
  for (const [v, b] of sortedEntries) {
    core.info(`    ${v.padEnd(6)} → ${b}`)
  }

  return inverseMap
}

// ---------------------------------------------------------------------------
// Resolve local interface versions to unique (branch, representative) pairs
//
// For each local version:
//   - exact match in inverseMap → use that branch
//   - no match (subsumed) → fall back to branch whose max is the smallest >= local
//
// Deduplicate by branch: one row per unique branch, using the highest
// representative version in that branch's group.
// ---------------------------------------------------------------------------

export function resolveVersions(
  localVersions: string[],
  inverseMap: InverseMap
): Rep[] {
  const sortedMaxes = Object.keys(inverseMap).sort(cmpSemver)
  const branchToRep: Record<string, Rep> = {}

  for (const v of localVersions) {
    let branch: string
    let representativeVersion: string
    let isExact: boolean

    if (v in inverseMap) {
      branch = inverseMap[v]
      representativeVersion = v
      isExact = true
    } else {
      const fallbackMax = sortedMaxes.find((m) => cmpSemver(m, v) >= 0)
      if (!fallbackMax) {
        core.warning(`${v}: no branch found (above all known maxes) — skipping`)
        continue
      }
      branch = inverseMap[fallbackMax]
      representativeVersion = fallbackMax
      isExact = false
    }

    const existing = branchToRep[branch]
    if (!existing) {
      branchToRep[branch] = {
        version: representativeVersion,
        branch,
        isExact,
        covers: [v]
      }
    } else {
      if (cmpSemver(representativeVersion, existing.version) > 0) {
        existing.version = representativeVersion
        existing.isExact = isExact
      }
      existing.covers.push(v)
    }
  }

  return Object.values(branchToRep).sort((a, b) =>
    cmpSemver(a.version, b.version)
  )
}

// ---------------------------------------------------------------------------
// Matrix builder
// ---------------------------------------------------------------------------

export function buildMatrix(
  fdiReps: Rep[],
  cdiReps: Rep[],
  extraAxes: Record<string, string[]>,
  latestExtraOverrides: Record<string, string>,
  strategy: string
): MatrixCell[] {
  const extraAxisNames = Object.keys(extraAxes)

  const latestExtra: Record<string, string> = {}
  for (const axis of extraAxisNames) {
    latestExtra[axis] =
      latestExtraOverrides[axis] ?? (extraAxes[axis].at(-1) as string)
  }

  const latestFdi = fdiReps.at(-1)?.version ?? null
  const latestCdi = cdiReps.at(-1)?.version ?? null

  let ifaceCells: MatrixCell[]

  if (fdiReps.length === 0 && cdiReps.length === 0) {
    ifaceCells = [{}]
  } else if (fdiReps.length === 0) {
    ifaceCells = cdiReps.map((c) => ({ 'cdi-version': c.version }))
  } else if (cdiReps.length === 0) {
    ifaceCells = fdiReps.map((f) => ({ 'fdi-version': f.version }))
  } else if (strategy === 'primary-full') {
    ifaceCells = []
    for (const f of fdiReps)
      for (const c of cdiReps)
        ifaceCells.push({ 'fdi-version': f.version, 'cdi-version': c.version })
  } else {
    // boundary: all FDI × latest CDI  +  other CDI × latest FDI
    ifaceCells = [
      ...fdiReps.map((f) => ({
        'fdi-version': f.version,
        'cdi-version': latestCdi as string
      })),
      ...cdiReps
        .filter((c) => c.version !== latestCdi)
        .map((c) => ({
          'fdi-version': latestFdi as string,
          'cdi-version': c.version
        }))
    ]
  }

  if (extraAxisNames.length === 0) {
    return ifaceCells
  }

  const seen = new Set<string>()
  const cells: MatrixCell[] = []

  function addCell(cell: MatrixCell): void {
    const key = JSON.stringify(cell, Object.keys(cell).sort())
    if (!seen.has(key)) {
      seen.add(key)
      cells.push(cell)
    }
  }

  const anchorExtra = Object.fromEntries(
    extraAxisNames.map((ax) => [ax, latestExtra[ax]])
  )

  for (const iface of ifaceCells) {
    addCell({ ...iface, ...anchorExtra })

    // Sweep extra axes only on the latest interface cell.
    // Non-latest interface cells get only the anchor (latest extra values).
    const isLatestIface =
      (latestFdi === null || iface['fdi-version'] === latestFdi) &&
      (latestCdi === null || iface['cdi-version'] === latestCdi)

    if (isLatestIface) {
      for (const axis of extraAxisNames) {
        for (const value of extraAxes[axis]) {
          if (value === latestExtra[axis]) continue
          addCell({ ...iface, ...anchorExtra, [axis]: value })
        }
      }
    }
  }

  return cells
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseJsonInput<T>(name: string, fallback: string): T {
  const raw = core.getInput(name) || fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`Invalid JSON for input '${name}': ${raw}`)
  }
}

export async function run(): Promise<void> {
  const includeCdi = core.getInput('include-cdi') === 'true'
  const includeFdi = core.getInput('include-fdi') === 'true'
  const upstreamFdiRepos = parseJsonInput<string[]>(
    'upstream-fdi-repos',
    '["supertokens-node"]'
  )
  const extraAxes = parseJsonInput<Record<string, string[]>>('extra-axes', '{}')
  const latestExtra = parseJsonInput<Record<string, string>>(
    'latest-extra',
    '{}'
  )
  const strategy = core.getInput('strategy') || 'boundary'
  const githubToken = core.getInput('github-token')
  const workingDirectory = core.getInput('working-directory') || '.'

  const tempDir = process.env['RUNNER_TEMP']
  if (!tempDir) throw new Error('RUNNER_TEMP is not set')

  // Read local interface files
  let localFdi: string[] = []
  let localCdi: string[] = []

  if (includeFdi) {
    const fdiPath = path.resolve(
      workingDirectory,
      'frontendDriverInterfaceSupported.json'
    )
    localFdi = (
      JSON.parse(fs.readFileSync(fdiPath, 'utf-8')) as { versions: string[] }
    ).versions
    core.info(`Local FDI versions: [${localFdi.join(', ')}]`)
  }
  if (includeCdi) {
    const cdiPath = path.resolve(
      workingDirectory,
      'coreDriverInterfaceSupported.json'
    )
    localCdi = (
      JSON.parse(fs.readFileSync(cdiPath, 'utf-8')) as { versions: string[] }
    ).versions
    core.info(`Local CDI versions: [${localCdi.join(', ')}]`)
  }

  // Build inverse maps and resolve representatives
  let fdiReps: Rep[] = []
  const fdiVersionMap: Record<string, Record<string, string>> = {}

  if (includeFdi && localFdi.length > 0) {
    core.info('\nResolving FDI versions:')
    const primaryRepo = upstreamFdiRepos[0]
    const primaryInverse = await buildInverseMap(
      primaryRepo,
      'frontendDriverInterfaceSupported.json',
      githubToken,
      tempDir
    )
    fdiReps = resolveVersions(localFdi, primaryInverse)

    core.info('\n  FDI representatives:')
    for (const r of fdiReps) {
      core.info(
        `    ${r.version}${r.isExact ? '' : ' (fallback)'}  →  covers [${r.covers.join(', ')}]`
      )
    }

    for (const repo of upstreamFdiRepos) {
      let inverseMap: InverseMap
      if (repo === primaryRepo) {
        inverseMap = primaryInverse
      } else {
        inverseMap = await buildInverseMap(
          repo,
          'frontendDriverInterfaceSupported.json',
          githubToken,
          tempDir
        )
      }
      fdiVersionMap[repo] = {}
      const repVersions = resolveVersions(localFdi, inverseMap)
      for (const r of repVersions) {
        fdiVersionMap[repo][r.version] = r.branch
      }
    }
  }

  let cdiReps: Rep[] = []
  const coreCdiVersionMap: Record<string, string> = {}

  if (includeCdi && localCdi.length > 0) {
    core.info('\nResolving CDI versions:')
    const inverseMap = await buildInverseMap(
      'supertokens-core',
      'coreDriverInterfaceSupported.json',
      githubToken,
      tempDir
    )
    cdiReps = resolveVersions(localCdi, inverseMap)

    core.info('\n  CDI representatives:')
    for (const r of cdiReps) {
      core.info(
        `    ${r.version}${r.isExact ? '' : ' (fallback)'}  →  covers [${r.covers.join(', ')}]`
      )
      coreCdiVersionMap[r.version] = r.branch
    }
  }

  const cells = buildMatrix(fdiReps, cdiReps, extraAxes, latestExtra, strategy)

  core.info(`\nStrategy:    ${strategy}`)
  core.info(`FDI reps:    ${fdiReps.length} unique branches`)
  core.info(`CDI reps:    ${cdiReps.length} unique branches`)
  core.info(`Extra axes:  ${JSON.stringify(extraAxes)}`)
  core.info(`Total cells: ${cells.length}`)
  cells.forEach((c, i) =>
    core.info(`  [${String(i + 1).padStart(2)}] ${JSON.stringify(c)}`)
  )

  const testMatrix = { include: cells }
  core.setOutput('testMatrix', JSON.stringify(testMatrix))

  if (Object.keys(coreCdiVersionMap).length > 0) {
    core.setOutput('coreCdiVersionMap', JSON.stringify(coreCdiVersionMap))
  }
  if (Object.keys(fdiVersionMap).length > 0) {
    core.setOutput('fdiVersionMap', JSON.stringify(fdiVersionMap))
  }

  core.setOutput('fdiVersions', JSON.stringify(fdiReps.map((r) => r.version)))
  core.setOutput('extraAxes', JSON.stringify(extraAxes))
}
