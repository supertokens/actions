/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
import * as core from '@actions/core'
import { run } from './main.js'

try {
  /* istanbul ignore next */
  run()
} catch (error) {
  // Fail the workflow run if an error occurs
  if (error instanceof Error) core.setFailed(error.message)
}
