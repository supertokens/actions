import * as core from '@actions/core'

type InputType = {
  driverName: string
  cdiVersion: string
  coreMode: string
  corePlanType: string
  frontendMode: string
  fdiVersion: string
  fetchFrontendVersions: boolean
  webJsInterfaceVersion: string
}

function getInputs(): InputType {
  return {
    driverName: core.getInput('driver-name', { required: true }),

    cdiVersion: core.getInput('cdi-version', { required: false }),
    coreMode: core.getInput('core-mode', { required: false }),
    corePlanType: core.getInput('core-plan-type', { required: false }),

    frontendMode: core.getInput('frontend-mode', { required: false }),
    fdiVersion: core.getInput('fdi-version', { required: false }),
    fetchFrontendVersions: core.getBooleanInput('fetch-frontend-versions', {
      required: false
    }),

    webJsInterfaceVersion: core.getInput('web-js-interface-version', {
      required: false
    })
  }
}

function ErrorFactory(
  params: { [key: string]: string },
  dataDescription: string,
  response: string,
  statusCode: number
) {
  const paramStr = Object.entries(params)
    .map(([key, val]) => `${key}=${val}`)
    .join(', ')

  return new Error(
    `Fetch ${dataDescription} for ${paramStr} yielded: ${response} with statusCode=${statusCode}`
  )
}

async function fetchWithApiKey({
  url,
  params,
  description,
  outputKey
}: {
  url: string
  params: { [key: string]: string }
  description: string
  outputKey: string
}) {
  const apiKey = process.env.SUPERTOKENS_API_KEY as string

  const queryParams = new URLSearchParams({
    password: apiKey,
    ...params
  })

  const urlObj = new URL(url)
  urlObj.search = queryParams.toString()

  const response = await fetch(urlObj)

  if (!response.ok) {
    throw ErrorFactory(
      params,
      description,
      await response.text(),
      response.status
    )
  }

  const responseData = (await response.json()) as { [key: string]: string }
  const data = responseData[outputKey]

  if (!data) {
    throw ErrorFactory(
      params,
      description,
      `${data} in response ${responseData}`,
      response.status
    )
  }

  return data
}

function getFetchDetails(inputs: InputType) {
  return {
    coreVersionXy: (cdiVersion: string) => ({
      url: 'https://api.supertokens.io/0/core-driver-interface/dependency/core/latest/',
      params: {
        planType: inputs.corePlanType,
        mode: inputs.coreMode,
        driverName: inputs.driverName,
        version: cdiVersion
      },
      description: 'core X.Y version',
      outputKey: 'core'
    }),
    coreTag: (coreVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/core/latest',
      params: {
        planType: inputs.corePlanType,
        mode: inputs.coreMode,
        version: coreVersionXy
      },
      description: 'core tag',
      outputKey: 'tag'
    }),
    coreVersion: (coreVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/core/latest',
      params: {
        planType: inputs.corePlanType,
        mode: inputs.coreMode,
        version: coreVersionXy
      },
      description: 'core version',
      outputKey: 'version'
    }),

    pluginInterfaceVersionXy: (coreVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/core/dependency/plugin-interface/latest',
      params: {
        planType: inputs.corePlanType,
        mode: inputs.coreMode,
        version: coreVersionXy
      },
      description: 'plugin-interface X.Y version',
      outputKey: 'pluginInterface'
    }),
    pluginInterfaceTag: (pluginInterfaceVersionXY: string) => ({
      url: 'https://api.supertokens.io/0/plugin-interface/latest',
      params: {
        planType: inputs.corePlanType,
        mode: inputs.coreMode,
        version: pluginInterfaceVersionXY
      },
      description: 'plugin-interface tag',
      outputKey: 'tag'
    }),
    pluginInterfaceVersion: (pluginInterfaceVersionXY: string) => ({
      url: 'https://api.supertokens.io/0/plugin-interface/latest',
      params: {
        planType: inputs.corePlanType,
        mode: inputs.coreMode,
        version: pluginInterfaceVersionXY
      },
      description: 'plugin-interface version',
      outputKey: 'version'
    }),

    frontendVersionXy: (fdiVersion: string) => ({
      url: 'https://api.supertokens.io/0/frontend-driver-interface/dependency/frontend/latest/',
      params: {
        frontendName: 'website',
        mode: inputs.frontendMode,
        driverName: inputs.driverName,
        version: fdiVersion
      },
      description: 'frontend X.Y version',
      outputKey: 'frontend'
    }),
    frontendTag: (frontendVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/driver/latest/',
      params: {
        mode: inputs.frontendMode,
        name: 'website',
        version: frontendVersionXy
      },
      description: 'frontend X.Y.Z version tag',
      outputKey: 'tag'
    }),
    frontendVersion: (frontendVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/driver/latest/',
      params: {
        mode: inputs.frontendMode,
        name: 'website',
        version: frontendVersionXy
      },
      description: 'frontend X.Y.Z version',
      outputKey: 'version'
    }),

    nodeVersionXy: (fdiVersion: string) => ({
      url: 'https://api.supertokens.io/0/frontend-driver-interface/dependency/driver/latest/',
      params: {
        frontendName: 'auth-react',
        mode: inputs.frontendMode,
        driverName: 'node',
        version: fdiVersion
      },
      description: 'node driver X.Y version',
      outputKey: 'driver'
    }),
    nodeTag: (nodeVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/driver/latest/',
      params: {
        mode: inputs.frontendMode,
        name: 'node',
        version: nodeVersionXy
      },
      description: 'node X.Y.Z version tag',
      outputKey: 'tag'
    }),

    authReactVersionXy: (fdiVersion: string) => ({
      url: 'https://api.supertokens.io/0/frontend-driver-interface/dependency/frontend/latest/',
      params: {
        frontendName: 'auth-react',
        mode: inputs.frontendMode,
        driverName: inputs.driverName,
        version: fdiVersion
      },
      description: 'auth-react frontend driver X.Y version',
      outputKey: 'frontend'
    }),
    authReactTag: (authReactVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/driver/latest/',
      params: {
        mode: inputs.frontendMode,
        name: 'auth-react',
        version: authReactVersionXy
      },
      description: 'auth-react frontend X.Y version tag',
      outputKey: 'tag'
    }),
    authReactVersion: (authReactVersionXy: string) => ({
      url: 'https://api.supertokens.io/0/driver/latest/',
      params: {
        mode: inputs.frontendMode,
        name: 'auth-react',
        version: authReactVersionXy
      },
      description: 'auth-react frontend X.Y version',
      outputKey: 'version'
    }),

    webJsReactVersionXy: (webJsInterfaceVersion: string) => ({
      url: 'https://api.supertokens.io/0/web-js-interface/dependency/frontend/latest',
      params: {
        frontendName: 'auth-react',
        mode: inputs.frontendMode,
        version: webJsInterfaceVersion
      },
      description: 'web-js-interface React X.Y version',
      outputKey: 'frontend'
    })
  }
}

export async function run(): Promise<void> {
  const inputs = getInputs()
  const {
    fdiVersion,
    cdiVersion,
    webJsInterfaceVersion,
    fetchFrontendVersions
  } = inputs
  const fetchDetails = getFetchDetails(inputs)

  if (cdiVersion) {
    const coreVersionXy = await fetchWithApiKey(
      fetchDetails.coreVersionXy(cdiVersion)
    )
    core.setOutput('coreVersionXy', coreVersionXy)
    core.info(`coreVersionXy=${coreVersionXy}`)

    const coreTag = await fetchWithApiKey(fetchDetails.coreTag(coreVersionXy))
    core.setOutput('coreTag', coreTag)
    core.info(`coreTag=${coreTag}`)

    const coreVersion = await fetchWithApiKey(
      fetchDetails.coreVersion(coreVersionXy)
    )
    core.setOutput('coreVersion', coreVersion)
    core.info(`coreVersion=${coreVersion}`)

    const pluginInterfaceVersionXy = await fetchWithApiKey(
      fetchDetails.pluginInterfaceVersionXy(coreVersionXy)
    )
    core.setOutput('pluginInterfaceVersionXy', pluginInterfaceVersionXy)
    core.info(`pluginInterfaceVersionXy=${pluginInterfaceVersionXy}`)

    const pluginInterfaceTag = await fetchWithApiKey(
      fetchDetails.pluginInterfaceTag(pluginInterfaceVersionXy)
    )
    core.setOutput('pluginInterfaceTag', pluginInterfaceTag)
    core.info(`pluginInterfaceTag=${pluginInterfaceTag}`)

    const pluginInterfaceVersion = await fetchWithApiKey(
      fetchDetails.pluginInterfaceVersion(pluginInterfaceVersionXy)
    )
    core.setOutput('pluginInterfaceVersion', pluginInterfaceVersion)
    core.info(`pluginInterfaceVersion=${pluginInterfaceVersion}`)
  }

  if (fdiVersion) {
    if (fetchFrontendVersions) {
      const frontendVersionXy = await fetchWithApiKey(
        fetchDetails.frontendVersionXy(fdiVersion)
      )
      core.setOutput('frontendVersionXy', frontendVersionXy)
      core.info(`frontendVersionXy=${frontendVersionXy}`)

      const frontendTag = await fetchWithApiKey(
        fetchDetails.frontendTag(frontendVersionXy)
      )
      core.setOutput('frontendTag', frontendTag)
      core.info(`frontendTag=${frontendTag}`)

      const frontendVersion = await fetchWithApiKey(
        fetchDetails.frontendVersion(frontendVersionXy)
      )
      core.setOutput('frontendVersion', frontendVersion)
      core.info(`frontendVersion=${frontendVersion}`)
    }

    const nodeVersionXy = await fetchWithApiKey(
      fetchDetails.nodeVersionXy(fdiVersion)
    )
    core.setOutput('nodeVersionXy', nodeVersionXy)
    core.info(`nodeVersionXy=${nodeVersionXy}`)

    const nodeTag = await fetchWithApiKey(fetchDetails.nodeTag(nodeVersionXy))
    core.setOutput('nodeTag', nodeTag)
    core.info(`nodeTag=${nodeTag}`)

    const authReactVersionXy = await fetchWithApiKey(
      fetchDetails.authReactVersionXy(fdiVersion)
    )
    core.setOutput('authReactVersionXy', authReactVersionXy)
    core.info(`authReactVersionXy=${authReactVersionXy}`)

    const authReactTag = await fetchWithApiKey(
      fetchDetails.authReactTag(authReactVersionXy)
    )
    core.setOutput('authReactTag', authReactTag)
    core.info(`authReactTag=${authReactTag}`)

    const authReactVersion = await fetchWithApiKey(
      fetchDetails.authReactVersion(authReactVersionXy)
    )
    core.setOutput('authReactVersion', authReactVersion)
    core.info(`authReactVersion=${authReactVersion}`)
  }

  if (webJsInterfaceVersion) {
    const webJsReactVersionXy = await fetchWithApiKey(
      fetchDetails.webJsReactVersionXy(webJsInterfaceVersion)
    )
    core.setOutput('webJsReactVersionXy', webJsReactVersionXy)
    core.info(`webJsReactVersionXy=${webJsReactVersionXy}`)

    const webJsReactTag = await fetchWithApiKey(
      fetchDetails.authReactTag(webJsReactVersionXy)
    )
    core.setOutput('webJsReactTag', webJsReactTag)
    core.info(`webJsReactTag=${webJsReactTag}`)

    const webJsReactVersion = await fetchWithApiKey(
      fetchDetails.authReactVersion(webJsReactVersionXy)
    )
    core.setOutput('webJsReactVersion', webJsReactVersion)
    core.info(`webJsReactVersion=${webJsReactVersion}`)
  }
}
