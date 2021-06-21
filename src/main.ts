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

import * as path from "path";
import * as semver from "semver";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { components } from "@octokit/openapi-types/generated/types";

type prT = components["schemas"]["pull-request-simple"];

type sectionT = { title: string; labels: Array<string> };

interface configT {
  repo?: string;
  owner?: string;
  title?: string;
  header?: string;
  footer?: string;
  draft?: boolean;
  prerelease?: boolean;
  title_prefix?: string;
  no_changes_message?: string;
  line_template?: (x: prT) => string;
  sections?: Array<sectionT>;
}

const DEFAULT_NO_CHANGES_MESSAGE = "No changes from the previous release.";
const GITHUB_ABUSE_LIMIT = 4;

const default_sections: Array<sectionT> = [
  { title: "🚀 Features", labels: ["enhancement", "feat", "perf"] },
  { title: "🐛 Bug Fixes", labels: ["bug", "fix", "revert"] },
  { title: "🧹 Maintenance", labels: ["docs", "style", "refactor", "test", "build", "ci", "chore"] },
];

function default_line_template(x: prT) {
  return `- ${x.title} [#${x.number}](${x.html_url})`;
}

function getBatches<T>(xs: Array<T>, batchSize: number) {
  const batches: Array<Array<T>> = [];
  xs.forEach((x, i) => {
    if (i % batchSize === 0) {
      batches.push([x]);
    } else {
      batches[batches.length - 1].push(x);
    }
  });
  return batches;
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

  const next_tag = core.getInput("tag", { required: true });
  const prev_tag = core.getInput("prev_tag", { required: true });
  const token = core.getInput("token", { required: true });

  let config: configT = {};
  const config_path = core.getInput("config", { required: false });
  if (config_path) {
    const p1 = process.cwd();
    const p2 = config_path;
    const p3 = path.join(p1, p2);
    console.log("p1:", p1);
    console.log("p2:", p2);
    console.log("p3:", p3);
    const mod = await import(p3);
    config = mod.default;
  }
  {
    if (!config.line_template) config.line_template = default_line_template;
    if (!config.sections) config.sections = default_sections;

    const header = core.getInput("header", { required: false });
    if (header) config.header = header;

    const footer = core.getInput("footer", { required: false });
    if (footer) config.footer = footer;

    if (!config.no_changes_message) config.no_changes_message = DEFAULT_NO_CHANGES_MESSAGE;
    const no_changes_message = core.getInput("no_changes_message", { required: false });
    if (no_changes_message) config.no_changes_message = no_changes_message;

    const title_prefix = core.getInput("title_prefix", { required: false });
    if (title_prefix) config.title_prefix = title_prefix;

    if (!config.title) config.title = config.title_prefix ? config.title_prefix + next_tag : "Release " + next_tag;
    const title = core.getInput("title", { required: false });
    if (title) config.title = title;

    if (!("draft" in config)) config.draft = true;
    const draft = core.getInput("draft", { required: false });
    if (draft) config.draft = draft === "true";

    if (!("prerelease" in config)) config.prerelease = semver.prerelease(next_tag) !== null;
    const prerelease = core.getInput("prerelease", { required: false });
    if (prerelease) config.prerelease = prerelease === "true";

    if (!config.owner) config.owner = context.repo.owner;
    const owner = core.getInput("owner", { required: false });
    if (owner) config.owner = owner;

    if (!config.repo) config.repo = context.repo.repo;
    const repo = core.getInput("repo", { required: false });
    if (repo) config.repo = repo;
  }
  const owner: string = config.owner;
  const repo: string = config.repo;

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
    console.log("tag is same as the previous tag. changelog will be empty!!");
    await oct.repos.createRelease({
      owner,
      repo,
      draft: config.draft,
      prerelease: config.prerelease,
      tag_name: next_tag,
      name: config.title,
      body: config.no_changes_message,
    });
    return;
  }

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

  const batches = getBatches(commits, GITHUB_ABUSE_LIMIT);
  const responses = [];
  for (const batch of batches) {
    const promises = batch.map((commit) =>
      oct.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: commit.sha,
      })
    );
    const batchResponses = await Promise.all(promises);
    responses.push(...batchResponses);
  }
  // console.log("responses are:");
  // console.log(responses.map((response) => response.data));
  // TODO: should we filter out pull requests that are still open?
  const pull_requests = [];
  for (const response of responses) {
    pull_requests.push(...response.data);
  }
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
  const grouped_pull_requests = groupBy(unique_pull_requests, (x) => {
    const label = x.labels && x.labels.length > 0 && x.labels[0].name ? x.labels[0].name : "";
    if (!config.sections) return "";
    for (const section of config.sections) {
      if (section.labels.includes(label)) {
        return section.title;
      }
    }
    return "";
  });
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
  for (const section_title in grouped_pull_requests) {
    grouped_pull_requests[section_title].sort((x, y) =>
      x.merged_at && y.merged_at && x.merged_at > y.merged_at ? -1 : 1
    );
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
  for (const section of config.sections) {
    if (!(section.title in grouped_pull_requests)) continue;
    const section_change_log = ["\n## " + section.title + "\n"];
    const prs = grouped_pull_requests[section.title];
    for (const pr of prs) {
      section_change_log.push(config.line_template(pr));
    }
    section_change_logs.push(section_change_log.join("\n"));
  }
  const release_body = [];
  if (config.header) release_body.push(config.header);
  release_body.push(section_change_logs.length > 0 ? section_change_logs.join("\n") : config.no_changes_message);
  if (config.footer) release_body.push(config.footer);

  console.log("the title is:");
  console.log(config.title);
  console.log("the release body is:");
  console.log(release_body.join("\n"));

  await oct.repos.createRelease({
    owner,
    repo,
    draft: config.draft,
    prerelease: config.prerelease,
    tag_name: next_tag,
    name: config.title,
    body: release_body.join("\n"),
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
