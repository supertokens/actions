import * as core from '@actions/core'
import { run } from './main.js'

/* istanbul ignore next */
run().catch((error: unknown) => {
  if (error instanceof Error) core.setFailed(error.message)
  else core.setFailed(String(error))
})
