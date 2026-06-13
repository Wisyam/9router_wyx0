/**
 * Cross-platform build wrapper.
 *
 * On Windows, Next 16's standalone file-tracing (@vercel/nft) globs the user's
 * home directory and crashes with a fatal unhandledRejection when it hits the
 * legacy compat junction `C:\Users\<user>\Application Data` (a self-looping
 * reparse point that always throws EPERM). That kills the build AFTER a clean
 * compile, so `.next/standalone/server.js` never gets emitted and `npm start`
 * fails.
 *
 * Fix: on win32 only, point HOME/USERPROFILE/APPDATA/LOCALAPPDATA at a
 * throwaway project-local dir for the duration of the build so nft never
 * touches the protected junction. This is a no-op on Linux/macOS (Docker,
 * deploy server), so it does not affect production builds there.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };

if (process.platform === "win32") {
  const buildHome = join(projectRoot, ".buildhome");
  mkdirSync(buildHome, { recursive: true });
  mkdirSync(join(buildHome, "Roaming"), { recursive: true });
  mkdirSync(join(buildHome, "Local"), { recursive: true });
  env.USERPROFILE = buildHome;
  env.HOME = buildHome;
  env.APPDATA = join(buildHome, "Roaming");
  env.LOCALAPPDATA = join(buildHome, "Local");
}

const child = spawn("next", ["build", "--webpack"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error("[build] failed to spawn next:", err);
  process.exit(1);
});
