#!/usr/bin/env node
// Builds the sticky PR comment body from vitest's JSON reporter output for the
// PR head and (optionally) the PR base, so reviewers see pass/fail counts and
// which tests are new without opening the Actions log.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [, , headJsonPath, headRoot, baseJsonPath, baseRoot, outPath] = process.argv;

const MARKER = "<!-- pr-test-results -->";

function normalizeRoot(root) {
  return root ? root.replace(/\/+$/, "") : "";
}

function loadReport(jsonPath, root) {
  if (!jsonPath || !existsSync(jsonPath)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch {
    return null;
  }
  const normalizedRoot = normalizeRoot(root);
  const tests = [];
  for (const file of data.testResults ?? []) {
    const relFile =
      normalizedRoot && file.name?.startsWith(normalizedRoot)
        ? file.name.slice(normalizedRoot.length).replace(/^\/+/, "")
        : file.name;
    for (const assertion of file.assertionResults ?? []) {
      tests.push({
        key: `${relFile} :: ${assertion.fullName}`,
        file: relFile,
        fullName: assertion.fullName,
        status: assertion.status,
        failureMessages: assertion.failureMessages ?? [],
      });
    }
  }
  return { data, tests };
}

function truncate(text, maxLines = 6) {
  const lines = text.split("\n").slice(0, maxLines);
  return lines.join("\n");
}

const head = loadReport(headJsonPath, headRoot);
const base = loadReport(baseJsonPath, baseRoot);

const lines = [MARKER];

if (!head) {
  lines.push(
    "### ⚠️ Test results unavailable",
    "",
    "The test run did not produce a report — it may have crashed before vitest could finish. Check the workflow log for details."
  );
  writeFileSync(outPath, lines.join("\n") + "\n");
  process.exit(0);
}

const baseKeys = new Set((base?.tests ?? []).map((t) => t.key));
const newTests = head.tests.filter((t) => !baseKeys.has(t.key));
const failing = head.tests.filter((t) => t.status === "failed");

const total = head.data.numTotalTests ?? head.tests.length;
const passedCount = head.data.numPassedTests ?? head.tests.filter((t) => t.status === "passed").length;
const failedCount = head.data.numFailedTests ?? failing.length;
const skippedCount = (head.data.numPendingTests ?? 0) + (head.data.numTodoTests ?? 0);

const statusIcon = failedCount > 0 ? "❌" : "✅";
lines.push(`### ${statusIcon} Test Results`);
lines.push("");
lines.push("| Total | Passed | Failed | Skipped | New tests |");
lines.push("|---|---|---|---|---|");
lines.push(`| ${total} | ${passedCount} | ${failedCount} | ${skippedCount} | ${newTests.length} |`);
lines.push("");

if (newTests.length) {
  lines.push(`<details><summary>🆕 New tests added (${newTests.length})</summary>`, "");
  for (const t of newTests) lines.push(`- \`${t.file}\` — ${t.fullName}`);
  lines.push("", "</details>", "");
}

if (failing.length) {
  lines.push(`<details open><summary>❌ Failing tests (${failing.length})</summary>`, "");
  for (const t of failing) {
    lines.push(`- \`${t.file}\` — ${t.fullName}`);
    const message = t.failureMessages[0];
    if (message) {
      lines.push("  ```", ...truncate(message).split("\n").map((l) => `  ${l}`), "  ```");
    }
  }
  lines.push("", "</details>", "");
} else {
  lines.push("All tests passed. ✅", "");
}

const baseSummary = base
  ? `${base.data.numPassedTests ?? 0}/${base.data.numTotalTests ?? 0} passed`
  : "n/a";
lines.push(`<sub>Base branch: ${baseSummary} · Updated ${new Date().toISOString()}</sub>`);

writeFileSync(outPath, lines.join("\n") + "\n");
