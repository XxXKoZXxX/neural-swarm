import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listJobs = vi.fn();
const downloadLogs = vi.fn();
const listRuns = vi.fn();
const createIssue = vi.fn();
const triggerAgent = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    constructor() {
      this.rest = {
        actions: {
          listJobsForWorkflowRun: listJobs,
          downloadJobLogsForWorkflowRun: downloadLogs,
          listWorkflowRunsForRepo: listRuns,
        },
        issues: { create: createIssue },
      };
    }
  },
}));

vi.mock("../src/swarm-logic.js", () => ({ SwarmSDK: { triggerAgent } }));

const sentinel = await import("../sentinel.js");

const run = {
  id: 42,
  name: "Deploy",
  html_url: "https://gh.test/run/42",
  head_sha: "abcdef1234567890",
  head_branch: "main",
  event: "push",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("buildIssueTitle", () => {
  it("uses the short sha and branch", () => {
    expect(sentinel.buildIssueTitle(run)).toBe("[SENTINEL] Deploy failed @ abcdef1 on main");
  });
});

describe("buildIssueBody", () => {
  it("renders the run metadata table and the diagnosis", () => {
    const body = sentinel.buildIssueBody(run, "root cause: flaky test");
    expect(body).toContain("| Run | [42](https://gh.test/run/42) |");
    expect(body).toContain("| Commit | `abcdef1234567890` |");
    expect(body).toContain("| Branch | `main` |");
    expect(body).toContain("| Triggered | push |");
    expect(body).toContain("root cause: flaky test");
    expect(body.trimEnd().endsWith("re-run the workflow.*")).toBe(true);
  });
});

describe("getFailedLogs", () => {
  it("collects logs only for failed jobs, capped at three", async () => {
    listJobs.mockResolvedValue({
      data: {
        jobs: [
          { id: 1, name: "a", conclusion: "failure" },
          { id: 2, name: "ok", conclusion: "success" },
          { id: 3, name: "b", conclusion: "failure" },
          { id: 4, name: "c", conclusion: "failure" },
          { id: 5, name: "d", conclusion: "failure" },
        ],
      },
    });
    downloadLogs.mockResolvedValue({ data: "log text" });

    const out = await sentinel.getFailedLogs(42);
    expect(downloadLogs).toHaveBeenCalledTimes(3);
    expect(out).toBe("### Job: a\nlog text\n\n### Job: b\nlog text\n\n### Job: c\nlog text");
    expect(out).not.toContain("### Job: ok");
  });

  it("truncates logs to the last 4000 characters and stringifies non-string payloads", async () => {
    listJobs.mockResolvedValue({ data: { jobs: [{ id: 1, name: "a", conclusion: "failure" }] } });
    downloadLogs.mockResolvedValue({ data: { line: "y".repeat(5000) } });
    const out = await sentinel.getFailedLogs(42);
    expect(out.length).toBe("### Job: a\n".length + 4000);
  });

  it("notes unavailable logs instead of throwing", async () => {
    listJobs.mockResolvedValue({ data: { jobs: [{ id: 1, name: "a", conclusion: "failure" }] } });
    downloadLogs.mockRejectedValue(new Error("410 gone"));
    await expect(sentinel.getFailedLogs(42)).resolves.toContain("[Logs unavailable");
  });

  it("returns an empty string when nothing failed", async () => {
    listJobs.mockResolvedValue({ data: { jobs: [{ id: 1, name: "a", conclusion: "success" }] } });
    await expect(sentinel.getFailedLogs(42)).resolves.toBe("");
  });
});

describe("createHealingIssue", () => {
  it("labels the issue and returns the created issue", async () => {
    createIssue.mockResolvedValue({ data: { html_url: "https://gh.test/issues/1" } });
    const issue = await sentinel.createHealingIssue(run, "diag");
    expect(issue.html_url).toBe("https://gh.test/issues/1");
    expect(createIssue.mock.calls[0][0]).toMatchObject({
      owner: "XxXKoZXxX",
      repo: "neural-swarm",
      title: sentinel.buildIssueTitle(run),
      labels: ["sentinel", "ci-failure"],
    });
  });
});

describe("healPipeline", () => {
  it("does nothing when there are no failed runs", async () => {
    listRuns.mockResolvedValue({ data: { workflow_runs: [] } });
    await sentinel.healPipeline();
    expect(triggerAgent).not.toHaveBeenCalled();
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("dispatches the debugger with the failure logs and opens an issue", async () => {
    listRuns.mockResolvedValue({ data: { workflow_runs: [run] } });
    listJobs.mockResolvedValue({ data: { jobs: [{ id: 1, name: "a", conclusion: "failure" }] } });
    downloadLogs.mockResolvedValue({ data: "boom" });
    triggerAgent.mockResolvedValue("diagnosis");
    createIssue.mockResolvedValue({ data: { html_url: "https://gh.test/issues/2" } });

    await sentinel.healPipeline();

    const [agent, opts] = triggerAgent.mock.calls[0];
    expect(agent).toBe("Debugger");
    expect(opts.errorLogs).toContain("boom");
    expect(opts.personality).toBe("Dark Detective");
    expect(opts.context).toContain("XxXKoZXxX/neural-swarm");
    expect(createIssue.mock.calls[0][0].body).toContain("diagnosis");
  });
});
