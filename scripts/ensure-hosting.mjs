import { spawnSync } from "node:child_process";
const project = "mergingsunapp-2";
const cli = "node_modules/firebase-tools/lib/bin/firebase.js";
const list = spawnSync(
  process.execPath,
  [
    cli,
    "hosting:sites:list",
    "--project",
    project,
    "--json",
    "--non-interactive",
  ],
  { encoding: "utf8" },
);
if (list.status !== 0) {
  process.stderr.write(list.stderr || list.stdout);
  process.exit(list.status || 1);
}
const response = JSON.parse(list.stdout);
if (!Array.isArray(response.result?.sites))
  throw new Error("Firebase returned an unexpected Hosting site list.");
if (response.result.sites.some((site) => site.name.endsWith("/" + project))) {
  console.log("Default Firebase Hosting site exists.");
} else {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "hosting:sites:create",
      project,
      "--project",
      project,
      "--non-interactive",
    ],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
