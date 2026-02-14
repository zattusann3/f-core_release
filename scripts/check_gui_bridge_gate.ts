const GATE_ID = "GATE_GUI_BRIDGE";

type GateCommand = {
  label: string;
  args: string[];
};

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const command of guiBridgeCommands()) {
    const result = await runDenoTest(command.args);
    if (result.testsRun <= 0) {
      failures.push(`${command.label} ran zero tests (possible rename/removal)`);
      break;
    }
    if (!result.ok) {
      failures.push(
        `${command.label} failed (exit ${result.code})\n${
          trimOutput(result.stderr || result.stdout)
        }`,
      );
      break;
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${GATE_ID}: ${failure}`);
    }
    Deno.exit(1);
  }

  console.log(`${GATE_ID}: PASS`);
}

function guiBridgeCommands(): GateCommand[] {
  return [
    {
      label: "schema reject",
      args: [
        "test",
        "--allow-run",
        "--allow-read",
        "--allow-write",
        "gui_bridge_test.ts",
        "--filter",
        "schema mismatch is rejected",
      ],
    },
    {
      label: "unknown top-level reject",
      args: [
        "test",
        "--allow-run",
        "--allow-read",
        "--allow-write",
        "gui_bridge_test.ts",
        "--filter",
        "unknown top-level field is rejected",
      ],
    },
    {
      label: "oversize reject",
      args: [
        "test",
        "--allow-run",
        "--allow-read",
        "--allow-write",
        "gui_bridge_test.ts",
        "--filter",
        "oversize message is rejected",
      ],
    },
    {
      label: "stdout JSONL purity",
      args: [
        "test",
        "--allow-run",
        "--allow-read",
        "--allow-write",
        "cli_test.ts",
        "--filter",
        "GATE_GUI_BRIDGE:STDOUT_JSONL_PURITY",
      ],
    },
    {
      label: "stderr diagnostics separation",
      args: [
        "test",
        "--allow-run",
        "--allow-read",
        "--allow-write",
        "cli_test.ts",
        "--filter",
        "GATE_GUI_BRIDGE:STDERR_DIAGNOSTICS",
      ],
    },
  ];
}

async function runDenoTest(
  args: string[],
): Promise<{ ok: boolean; code: number; stdout: string; stderr: string; testsRun: number }> {
  const command = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const stdout = decode(output.stdout);
  const stderr = decode(output.stderr);
  return {
    ok: output.success,
    code: output.code,
    stdout,
    stderr,
    testsRun: countExecutedTests(`${stdout}\n${stderr}`),
  };
}

function countExecutedTests(text: string): number {
  let total = 0;
  const pattern = /running\s+(\d+)\s+tests?\s+from\b/g;
  for (const match of text.matchAll(pattern)) {
    total += Number(match[1]);
  }
  return total;
}

function trimOutput(text: string): string {
  const lines = text.trim().split("\n");
  if (lines.length <= 12) return text.trim();
  return `${lines.slice(0, 12).join("\n")}\n...`;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

if (import.meta.main) {
  await main();
}
