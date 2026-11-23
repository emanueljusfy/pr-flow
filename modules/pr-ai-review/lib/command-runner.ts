import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; env?: Record<string, string | undefined> }
) => Promise<{ stdout: string; stderr: string; code: number }>;

export async function defaultCommandRunner(
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; env?: Record<string, string | undefined> }
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeoutMs,
      env: options?.env as NodeJS.ProcessEnv | undefined,
      maxBuffer: 20 * 1024 * 1024
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    if (err.code === "ENOENT") {
      const missing = new Error(`command_not_found:${command}`);
      (missing as Error & { reason: string }).reason = "agent_not_found";
      throw missing;
    }

    const code =
      typeof err.code === "number"
        ? err.code
        : err.killed || err.signal === "SIGTERM"
          ? 124
          : 1;

    return {
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.message,
      code
    };
  }
}
