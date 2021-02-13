# create-release-draft

Prepare the change log and create the release draft.

## Action Inputs

| Name | Description | Required |
| --- | --- | --- |
| tag | An existing tag to use for the release draft. | true |
| prev_tag | The previous tag to start calculating the changelog from. | true |
| title | The title for the release draft. | true |
| token | GitHub API token with push permissions to use for creating the release draft. | true |
| owner | Owner of the repo to create the release draft for. Default is the current owner. | false |
| repo | Repo to create the release draft for. Default is the current repo. | false |
| prerelease | Set to true if this is a prerelease. Default is false. | false |

## Example

```
For more documentation and support please visit https://konveyor.io/move2kube/
# Changelog

## 🚀 Features

- feat: Move fixers to a package and simplify convert logic [#404](https://github.com/konveyor/move2kube/pull/404)
- feat: order containerization options in terms of container build type priority [#422](https://github.com/konveyor/move2kube/pull/422)
- feat: support * as a match all selector in qa keys [#415](https://github.com/konveyor/move2kube/pull/415)

## 🐛 Bug Fixes

- fix: parsing of config strings [#416](https://github.com/konveyor/move2kube/pull/416)

## 🧹 Maintenance

- chore: allow install script to install any tag [#424](https://github.com/konveyor/move2kube/pull/424)
- chore: get the new index.yaml from the latest release [#420](https://github.com/konveyor/move2kube/pull/420)
- chore: combine all 3 steps of asking a question into a single function call [#418](https://github.com/konveyor/move2kube/pull/418)
- chore: octokit is not defined in github workflows, use github instead [#413](https://github.com/konveyor/move2kube/pull/413)
```