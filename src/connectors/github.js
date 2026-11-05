import { getConfig } from "../config/env.js";

async function githubRequest(path, { useToken = true } = {}) {
  const config = getConfig().github;

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CodexGeneralLocalAgent/0.1",
      ...(useToken && config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function getRepoTarget({ owner, repo } = {}) {
  const config = getConfig().github;
  const target = {
    owner: owner || config.owner,
    repo: repo || config.repo,
  };
  if (!target.owner || !target.repo) {
    throw new Error("Missing GitHub owner or repo. Set GITHUB_OWNER/GITHUB_REPO or pass owner/repo.");
  }
  return target;
}

async function optionalGitHubRead(name, readFn, fallback) {
  try {
    return {
      ok: true,
      value: await readFn(),
    };
  } catch (error) {
    return {
      ok: false,
      value: fallback,
      error: {
        name,
        message: error.message,
      },
    };
  }
}

export async function getGitHubRepository(input = {}) {
  const { owner, repo } = getRepoTarget(input);
  const data = await githubRequest(`/repos/${owner}/${repo}`, { useToken: input.useToken !== false });
  return {
    fullName: data.full_name,
    private: data.private,
    description: data.description,
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
    openIssuesCount: data.open_issues_count,
    stars: data.stargazers_count,
    forks: data.forks_count,
    updatedAt: data.updated_at,
    pushedAt: data.pushed_at,
  };
}

export async function listGitHubIssues({ owner, repo, state = "open", perPage = 10, useToken = true } = {}) {
  const target = getRepoTarget({ owner, repo });
  const items = await githubRequest(`/repos/${target.owner}/${target.repo}/issues?state=${state}&per_page=${perPage}`, {
    useToken,
  });
  return items
    .filter((item) => !item.pull_request)
    .map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      htmlUrl: item.html_url,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      labels: item.labels.map((label) => label.name),
      author: item.user?.login,
    }));
}

export async function listGitHubPullRequests({ owner, repo, state = "open", perPage = 10, useToken = true } = {}) {
  const target = getRepoTarget({ owner, repo });
  const items = await githubRequest(`/repos/${target.owner}/${target.repo}/pulls?state=${state}&per_page=${perPage}`, {
    useToken,
  });
  return items.map((item) => ({
    number: item.number,
    title: item.title,
    state: item.state,
    htmlUrl: item.html_url,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    author: item.user?.login,
    draft: item.draft,
  }));
}

export async function listGitHubCommits({ owner, repo, perPage = 10, useToken = true } = {}) {
  const target = getRepoTarget({ owner, repo });
  const items = await githubRequest(`/repos/${target.owner}/${target.repo}/commits?per_page=${perPage}`, { useToken });
  return items.map((item) => ({
    sha: item.sha.slice(0, 7),
    message: item.commit?.message?.split("\n")[0] || "",
    htmlUrl: item.html_url,
    author: item.author?.login || item.commit?.author?.name,
    date: item.commit?.author?.date,
  }));
}

export async function getGitHubProjectSummary({ owner, repo, perPage = 10, useToken = true } = {}) {
  const [repository, issues, pullRequests, commits] = await Promise.all([
    optionalGitHubRead("repository", () => getGitHubRepository({ owner, repo, useToken }), null),
    optionalGitHubRead("issues", () => listGitHubIssues({ owner, repo, perPage, useToken }), []),
    optionalGitHubRead("pullRequests", () => listGitHubPullRequests({ owner, repo, perPage, useToken }), []),
    optionalGitHubRead("commits", () => listGitHubCommits({ owner, repo, perPage, useToken }), []),
  ]);
  if (!repository.ok) {
    throw new Error(repository.error.message);
  }
  return {
    repository: repository.value,
    issues: issues.value,
    pullRequests: pullRequests.value,
    commits: commits.value,
    warnings: [issues, pullRequests, commits].filter((item) => !item.ok).map((item) => item.error),
  };
}
