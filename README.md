# create-release-draft
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fkonveyor%2Fcreate-release-draft.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fkonveyor%2Fcreate-release-draft?ref=badge_shield)


Prepare the change log and create the release draft. The change log is created using labelled pull requests.  
The change log can have several sections. Each section can have a set of labels used to filter pull requests.

Process for creating the change log is:
1. We find the 2 commits associated with tag and prev_tag.
1. We find all the commits between the 2 commits.
1. We find all the pull requests that are associated with these commits.
1. We group the pull requests by label.
1. We sort the pull requests in each group by timestamp.
1. We create each line in each section using line = line_template(pull_request).

## Action Inputs

| Name | Description | Required |
| --- | --- | --- |
| token | GitHub API token with push permissions to the repo. Used for creating the release draft. | true |
| tag | An existing tag to use for the release draft. | true |
| prev_tag | The previous tag to start calculating the change log from. | true |
| owner | Owner of the repo to create the release draft for. Default is the owner of the current repo. | false |
| repo | Repo to create the release draft for. Default is the current repo. | false |
| title | The title for the release draft. Default is 'Release ' + tag. | false |
| title_prefix | title = prefix + tag. If both title and title_prefix are specified then title takes priority. | false |
| header | The header will be placed before the change log in the release body. Default empty string. | false |
| footer | The footer will be placed after the change log in the release body. Default empty string. | false |
| no_changes_message | This message will be placed in the release body when the change log is empty. Default is "No changes from the previous release." | false |
| draft | Set to false to publish this release draft. Default is true. | false |
| prerelease | Set to true if this is a prerelease. By default it parses the tag as a semantic version to see if it is a prerelease. | false |
| config | Path to a configuration file. By default no config is used. The settings specified here override those in the config. | false |

## Configuration

The config file is just a `.js` javascript file containing the same settings as above and some extras. Example:

```
module.exports = {
    title_prefix: "My App ",
    // valid PR types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
    sections:
        [
            { title: "🚀 Features", labels: ["enhancement", "feat", "perf"] },
            { title: "🐛 Bug Fixes", labels: ["bug", "fix", "revert"] },
            { title: "🧹 Maintenance", labels: ["docs", "style", "refactor", "test", "build", "ci", "chore"] },
        ],
    header: `For more documentation and support please visit https://konveyor.io/move2kube/
# Changelog`,
    line_template: x => `- ${x.title} [#${x.number}](${x.html_url})`,
}
```

## Example change log

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

## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fkonveyor%2Fcreate-release-draft.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fkonveyor%2Fcreate-release-draft?ref=badge_large)