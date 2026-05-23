import { spawn } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export function runCommand(command: string, args: string[], timeoutMs = 120_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || `${command} exited with code ${code}.`));
    });
  });
}
