import { spawn } from "node:child_process";
import { CommandExecutor, CommandResult } from "../types.js";

export class ShellCommandRunner implements CommandExecutor {
  async run(cmd: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        resolve({
          code: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
    });
  }
}
