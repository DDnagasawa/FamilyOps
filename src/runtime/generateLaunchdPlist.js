import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PLIST_PATH = path.join(process.cwd(), "data", "com.codex.general-agent.plist");
const DEFAULT_CALLBACK_PLIST_PATH = path.join(process.cwd(), "data", "com.codex.general-agent-callback.plist");

export function generateLaunchdPlist({ outputPath = DEFAULT_PLIST_PATH } = {}) {
  return generatePlist({
    outputPath,
    label: "com.codex.general-agent",
    args: ["daemon"],
    outLog: "daemon.out.log",
    errLog: "daemon.err.log",
  });
}

export function generateCallbackLaunchdPlist({ outputPath = DEFAULT_CALLBACK_PLIST_PATH } = {}) {
  return generatePlist({
    outputPath,
    label: "com.codex.general-agent-callback",
    args: ["callback:server"],
    outLog: "callback.out.log",
    errLog: "callback.err.log",
  });
}

function generatePlist({ outputPath, label, args, outLog, errLog }) {
  const nodePath = process.execPath;
  const projectDir = process.cwd();
  const logDir = path.join(projectDir, "logs");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${path.join(projectDir, "src", "cli.js")}</string>
${args.map((arg) => `    <string>${arg}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(logDir, outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, errLog)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${os.homedir()}</string>
  </dict>
</dict>
</plist>
`;

  fs.writeFileSync(outputPath, plist, "utf8");
  return outputPath;
}
