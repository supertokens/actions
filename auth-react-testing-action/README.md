# auth-react-testing-action
Composite action to clone `supertokens-auth-react`, run tests, and report them on Github.

## Inputs
| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| auth-react-version  | true     | N/A     | The git ref to clone, usually a version tag |
| node-version | true | N/A | The git ref to use for `supertokens-node`, usually a version tag |
| check-name-suffix | true | N/A | Suffix to append to check names (usually matrix values) |
| path     | false    | supertokens-auth-react | Relative path where the repo will be cloned |
| should-clone | false | true | Whether the `supertokens-auth-react` repo should be cloned |