#!/usr/bin/env node
/**
 * rebuild-marketplace.mjs
 *
 * Discover every public fnrhombus repo tagged with the `claude-code-plugin`
 * topic, fetch each one's .claude-plugin/plugin.json from its default branch,
 * and rewrite this repo's .claude-plugin/marketplace.json with entries pointing
 * back at each plugin's own repo.
 *
 * Runs inside GitHub Actions with:
 *   - GH_TOKEN: the workflow's default GITHUB_TOKEN (public repo reads + this
 *     repo's writes). No PAT needed.
 *   - FORCE: "true" to emit `changed=true` even when marketplace.json is
 *     unchanged (useful to verify the commit step in workflow_dispatch).
 *
 * Writes outputs to $GITHUB_OUTPUT:
 *   - changed: "true" if marketplace.json was modified
 *   - count: number of plugins in the rebuilt marketplace
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";

const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
const OWNER = "fnrhombus";
const DISCOVERY_TOPIC = "claude-code-plugin";

// ---------------------------------------------------------------------------
// gh helper
// ---------------------------------------------------------------------------

function gh(args) {
  const out = execFileSync("gh", args, { encoding: "utf8" });
  return out.trim();
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

// ---------------------------------------------------------------------------
// Discovery — find every fnrhombus repo with the discovery topic
// ---------------------------------------------------------------------------

console.error(`Searching for ${OWNER} repos tagged \`${DISCOVERY_TOPIC}\`...`);

const repos = ghJson([
  "search",
  "repos",
  `topic:${DISCOVERY_TOPIC}`,
  `user:${OWNER}`,
  "--json",
  "name,fullName,defaultBranch,isArchived,visibility",
  "--limit",
  "100",
]);

console.error(`Found ${repos.length} candidate repo(s).`);

// Drop archived repos; private ones wouldn't surface in search but double-check.
const live = repos.filter((r) => !r.isArchived && r.visibility === "PUBLIC");

// ---------------------------------------------------------------------------
// Fetch each plugin.json
// ---------------------------------------------------------------------------

const entries = [];

for (const repo of live) {
  const branch = repo.defaultBranch ?? "main";
  const fullName = repo.fullName;
  console.error(`\n→ ${fullName}@${branch}`);

  let pluginJsonRaw;
  try {
    // Use the raw-content API via gh. --jq extracts and base64-decodes.
    pluginJsonRaw = gh([
      "api",
      `repos/${fullName}/contents/.claude-plugin/plugin.json`,
      "--jq",
      ".content",
    ]);
  } catch (err) {
    console.error(`  SKIP: no .claude-plugin/plugin.json (${err.message.split("\n")[0]})`);
    continue;
  }

  let plugin;
  try {
    const decoded = Buffer.from(pluginJsonRaw, "base64").toString("utf8");
    plugin = JSON.parse(decoded);
  } catch (err) {
    console.error(`  SKIP: invalid plugin.json (${err.message})`);
    continue;
  }

  if (!plugin.name) {
    console.error("  SKIP: plugin.json missing 'name'");
    continue;
  }

  // Try to read the latest release tag for version pinning. If no releases,
  // fall back to the default branch (unpinned).
  let ref = branch;
  try {
    const release = ghJson([
      "release",
      "view",
      "--repo",
      fullName,
      "--json",
      "tagName",
    ]);
    ref = release.tagName;
    console.error(`  latest release: ${ref}`);
  } catch {
    console.error(`  no releases, pinning to ${branch}`);
  }

  const entry = {
    name: plugin.name,
    source: {
      source: "github",
      repo: fullName,
      ref,
    },
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    repository: `https://github.com/${fullName}`,
    license: plugin.license ?? "MIT",
  };

  // Strip undefined fields so JSON output is clean.
  for (const k of Object.keys(entry)) {
    if (entry[k] === undefined) delete entry[k];
  }

  entries.push(entry);
  console.error(`  ✓ ${plugin.name}@${plugin.version ?? "?"}`);
}

// ---------------------------------------------------------------------------
// Sort and write
// ---------------------------------------------------------------------------

entries.sort((a, b) => a.name.localeCompare(b.name));

const marketplace = {
  name: "fnrhombus-plugins",
  owner: { name: OWNER },
  plugins: entries,
};

const next = JSON.stringify(marketplace, null, 2) + "\n";
const prev = existsSync(MARKETPLACE_FILE) ? readFileSync(MARKETPLACE_FILE, "utf8") : "";

const changed = next !== prev;
writeFileSync(MARKETPLACE_FILE, next);

console.error(
  `\n${changed ? "CHANGED" : "unchanged"}: ${entries.length} plugin(s) in marketplace`,
);

// ---------------------------------------------------------------------------
// Emit workflow outputs
// ---------------------------------------------------------------------------

const forceCommit = (process.env.FORCE ?? "").toLowerCase() === "true";
const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  appendFileSync(outputFile, `changed=${changed || forceCommit}\n`);
  appendFileSync(outputFile, `count=${entries.length}\n`);
}
