
/*
Copyright IBM Corporation 2020
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as core from "@actions/core";
import * as github from "@actions/github";
import { components } from "@octokit/openapi-types/generated/types";

type prT = components["schemas"]["pull-request-simple"];

const preamble = `For more documentation and support please visit https://konveyor.io/move2kube/
# Changelog`;

const sections = [
  { title: "🚀 Features", labels: ["enhancement", "feat", "perf"] },
  { title: "🐛 Bug Fixes", labels: ["bug", "fix", "revert"] },
  { title: "🧹 Maintenance", labels: ["docs", "style", "refactor", "test", "build", "ci", "chore"] },
];

function get_change_log_line(x: prT) {
  return `- ${x.title} [#${x.number}](${x.html_url})`;
}

function groupBy<T>(xs: Array<T>, get_group: (x: T) => string) {
  const reducer = (acc: Record<string, Array<T>>, x: T) => {
    const group: string = get_group(x);
    if (group in acc) {
      acc[group].push(x);
    } else {
      acc[group] = [x];
    }
    return acc;
  };
  return xs.reduce(reducer, {});
}

async function main(): Promise<void> {
  const context = github.context;

  const title = core.getInput("title", { required: true });
  const next_tag = core.getInput("tag", { required: true });
  const prev_tag = core.getInput("prev_tag", { required: true });
  const token = core.getInput("token", { required: true });
  const owner = core.getInput("owner", { required: false }) || context.repo.owner;
  const repo = core.getInput("repo", { required: false }) || context.repo.repo;
  const prerelease_str = core.getInput("prerelease", { required: false }) || "false";
  const prerelease = prerelease_str === "true";

  const oct = github.getOctokit(token);

  // 2 tags -> 2 commits
  const prev_tag_resp = await oct.git.getRef({
    owner,
    repo,
    ref: "tags/" + prev_tag,
  });
  // console.log("response for prev tag is", prev_tag_resp);
  const next_tag_resp = await oct.git.getRef({
    owner,
    repo,
    ref: "tags/" + next_tag,
  });
  // console.log("response for next tag is", next_tag_resp);

  const prev_tag_sha = prev_tag_resp.data.object.sha;
  const next_tag_sha = next_tag_resp.data.object.sha;

  const prev_commit_resp = await oct.git.getCommit({
    owner,
    repo,
    commit_sha: prev_tag_sha,
  });
  // console.log("response for prev tag commit is", prev_commit_resp);
  const next_commit_resp = await oct.git.getCommit({
    owner,
    repo,
    commit_sha: next_tag_sha,
  });
  // console.log("response for next tag commit is", next_commit_resp);

  // 2 commits -> commit list
  // console.log("prev_commit_resp.data.parents", prev_commit_resp.data.parents);
  // console.log("next_commit_resp.data.parents", next_commit_resp.data.parents);

  const commits = [];
  if (next_commit_resp.data.sha === prev_commit_resp.data.sha) {
    throw new Error("tag is same as the previous tag. changelog will be empty!!");
  } else {
    let parent_commit_resp = next_commit_resp;
    while (parent_commit_resp.status === 200) {
      commits.push(parent_commit_resp.data);
      const parents = parent_commit_resp.data.parents;
      if (parents.length !== 1) {
        throw new Error(`expected there to be a single parent. found: ${JSON.stringify(parents)}`);
      }
      const parent = parents[0];
      if (parent.sha === prev_tag_sha) {
        console.log("reached the previous tag commit!!!");
        break;
      }
      parent_commit_resp = await oct.git.getCommit({
        owner,
        repo,
        commit_sha: parent.sha,
      });
    }
  }

  // console.log("the commits are:");
  // console.log(
  //   commits.map((x) => ({
  //     sha: x.sha,
  //     msg: x.message,
  //     committer: x.committer,
  //     author: x.author,
  //   }))
  // );
  // commit list -> pr list
  const promises = commits.map((commit) =>
    oct.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commit.sha,
    })
  );
  const responses = await Promise.all(promises);
  // console.log("responses are:");
  // console.log(responses.map((response) => response.data));
  // TODO: should we filter out pull requests that are still open?
  if (responses.some((response) => response.data.length !== 1)) {
    // TODO: should we allow this case?
    throw new Error("more than one PR associated with the same commit!!!");
  }
  const pull_requests = responses.map((response) => response.data[0]);
  // console.log("pull_requests are:");
  // console.log(pull_requests.map((pull_request) => pull_request.number));

  const pull_request_numbers = new Set();
  const unique_pull_requests = [];
  for (const pull_request of pull_requests) {
    if (pull_request.number in pull_request_numbers) {
      continue;
    }
    unique_pull_requests.push(pull_request);
    pull_request_numbers.add(pull_request.number);
  }
  // console.log("unique_pull_requests are:");
  // console.log(unique_pull_requests);

  // console.log(
  //   unique_pull_requests.map((pr) => pr.labels.map((label) => label.name))
  // );

  // group the pull requests by labels
  const grouped_pull_requests = groupBy(unique_pull_requests, (x) =>
    x.labels && x.labels.length > 0 && x.labels[0].name ? x.labels[0].name : "default_group"
  );
  // console.log("before sorting");
  // console.log(grouped_pull_requests);
  // for (const label in grouped_pull_requests) {
  //   console.log(
  //     label,
  //     grouped_pull_requests[label].map((x) => ({
  //       num: x.number,
  //       closed_at: x.closed_at,
  //       merged_at: x.merged_at,
  //     }))
  //   );
  // }
  // sort pull requests by commit timestamp
  for (const label in grouped_pull_requests) {
    grouped_pull_requests[label].sort((x, y) => (x.merged_at && y.merged_at && x.merged_at > y.merged_at ? -1 : 1));
  }
  // console.log("after sorting");
  // console.log(grouped_pull_requests);
  // for (const label in grouped_pull_requests) {
  //   console.log(
  //     label,
  //     grouped_pull_requests[label].map((x) => ({
  //       num: x.number,
  //       closed_at: x.closed_at,
  //       merged_at: x.merged_at,
  //     }))
  //   );
  // }
  // fill the template using the grouped sorted pull requests
  const section_change_logs = [];
  for (const section of sections) {
    const section_change_log = ["\n## " + section.title + "\n"];
    for (const label in grouped_pull_requests) {
      if (section.labels.includes(label)) {
        const prs = grouped_pull_requests[label];
        for (const pr of prs) {
          section_change_log.push(get_change_log_line(pr));
        }
      }
    }
    section_change_logs.push(section_change_log.join("\n"));
  }
  const release_body = preamble + "\n" + section_change_logs.join("\n");

  console.log("the title is:");
  console.log(title);
  console.log("the release body is:");
  console.log(release_body);

  await oct.repos.createRelease({
    owner,
    repo,
    draft: true,
    prerelease,
    tag_name: next_tag,
    name: title,
    body: release_body,
  });
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
