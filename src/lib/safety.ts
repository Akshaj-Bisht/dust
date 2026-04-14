import os from "node:os";
import path from "node:path";

const CRITICAL_PATHS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/home",
  "/lib",
  "/lib64",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/srv",
  "/sys",
  "/usr",
  "/var",
]);

export const isCriticalPath = (candidatePath: string): boolean => {
  return CRITICAL_PATHS.has(path.resolve(candidatePath));
};

export const isWithinPath = (rootPath: string, candidatePath: string): boolean => {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}/`);
};

export const ensureSafeDeletePath = (
  candidatePath: string,
  allowedRoots: string[],
): { ok: true } | { ok: false; reason: string } => {
  const resolvedCandidate = path.resolve(candidatePath);
  if (isCriticalPath(resolvedCandidate)) {
    return { ok: false, reason: `Refusing to delete critical path: ${resolvedCandidate}` };
  }

  if (allowedRoots.some((root) => isWithinPath(root, resolvedCandidate))) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Path is outside safe cleanup roots: ${resolvedCandidate}`,
  };
};

export const defaultAllowedCleanupRoots = (): string[] => {
  const home = os.homedir();
  return [path.join(home, ".cache"), "/tmp", path.join(home, ".local", "state"), "/var/log"];
};
