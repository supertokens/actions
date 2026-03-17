# backend-sdk-testing-action
Composite action to clone `backend-sdk-testing`, run tests, and report them on Github.

## Inputs
| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| version  | true     | N/A     | The git ref to clone, usually the FDI version |
| path     | false    | backend-sdk-testing | Relative path where the repo will be cloned