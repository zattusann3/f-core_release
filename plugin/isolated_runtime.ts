import type { PluginInvokeContext, PluginInvokeResult, PluginRuntime } from "../vm/runner.ts";

type SubprocessRequest = {
  contractVersion: 1;
  requestId: string;
  primitive: string;
  attrs: Record<string, string>;
};

type SubprocessEffect =
  | { kind: "ui.render"; text: string }
  | { kind: "debug.log"; message: string };

type SubprocessResponse =
  | { contractVersion: 1; requestId: string; ok: true; effect?: SubprocessEffect }
  | { contractVersion: 1; requestId: string; ok: false; message: string };

const CANCEL_POLL_INTERVAL_MS = 20;
const MAX_IPC_MESSAGE_BYTES = 65_536;
let requestSequence = 0;

export function createIsolatedPluginRuntime(
  renderText?: (text: string) => void,
): PluginRuntime {
  return {
    invoke: async (name, attrs, context) => {
      return await invokeInSubprocess(name, attrs, context, renderText);
    },
  };
}

async function invokeInSubprocess(
  name: string,
  attrs: Record<string, string>,
  context: PluginInvokeContext,
  renderText?: (text: string) => void,
): Promise<PluginInvokeResult> {
  const workerScriptUrl = new URL("./subprocess_worker.ts", import.meta.url);
  const process = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--quiet",
      "--deny-sys",
      "--deny-import",
      "--deny-read",
      "--deny-write",
      "--deny-net",
      "--deny-env",
      "--deny-run",
      "--deny-ffi",
      workerScriptUrl.href,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const request: SubprocessRequest = {
    contractVersion: 1,
    requestId: `req-${requestSequence++}`,
    primitive: name,
    attrs,
  };
  const encodedRequest = new TextEncoder().encode(JSON.stringify(request) + "\n");
  if (encodedRequest.byteLength > MAX_IPC_MESSAGE_BYTES) {
    process.kill("SIGKILL");
    await process.stdin.close().catch(() => {});
    await process.stdout.cancel().catch(() => {});
    await process.stderr.cancel().catch(() => {});
    await process.status.catch(() => {});
    return { ok: false, code: "E0704", message: "plugin request exceeds max bytes" };
  }
  const stdinWriter = process.stdin.getWriter();
  stdinWriter.write(encodedRequest)
    .catch(() => {})
    .finally(() => {
      stdinWriter.releaseLock();
      process.stdin.close().catch(() => {});
    });

  const statusPromise = process.status;
  const stdoutTextPromise = readStreamText(process.stdout, MAX_IPC_MESSAGE_BYTES, "stdout");
  const stderrTextPromise = readStreamText(process.stderr, MAX_IPC_MESSAGE_BYTES, "stderr");
  const startedAt = Date.now();

  return await new Promise((resolve) => {
    let settled = false;

    const finish = (result: PluginInvokeResult, terminate: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      clearInterval(cancelPollId);
      void (async () => {
        if (terminate && process.pid !== undefined) {
          try {
            process.kill("SIGKILL");
          } catch {
            // Process may have already exited.
          }
        }
        await process.stdin.close().catch(() => {});
        await process.stdout.cancel().catch(() => {});
        await process.stderr.cancel().catch(() => {});
        await statusPromise.catch(() => {});
        resolve(result);
      })();
    };

    const timeoutId = setTimeout(() => {
      finish(
        { ok: false, code: "E0705", message: `async plugin timeout after ${context.timeoutMs}ms` },
        true,
      );
    }, context.timeoutMs);

    const cancelPollId = setInterval(() => {
      if (Date.now() - startedAt > context.timeoutMs) {
        finish(
          {
            ok: false,
            code: "E0705",
            message: `async plugin timeout after ${context.timeoutMs}ms`,
          },
          true,
        );
        return;
      }
      if (context.isCancelled()) {
        finish({ ok: false, code: "E0706", message: "async plugin cancelled" }, true);
      }
    }, CANCEL_POLL_INTERVAL_MS);

    statusPromise.then(async (status) => {
      if (Date.now() - startedAt > context.timeoutMs) {
        finish(
          {
            ok: false,
            code: "E0705",
            message: `async plugin timeout after ${context.timeoutMs}ms`,
          },
          false,
        );
        return;
      }
      if (context.isCancelled()) {
        finish({ ok: false, code: "E0706", message: "async plugin cancelled" }, false);
        return;
      }
      let stdoutText = "";
      try {
        stdoutText = (await stdoutTextPromise).trim();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        finish({ ok: false, code: "E0704", message }, false);
        return;
      }
      let stderrText = "";
      try {
        stderrText = (await stderrTextPromise).trim();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        finish({ ok: false, code: "E0704", message }, false);
        return;
      }
      if (status.code !== 0) {
        finish({
          ok: false,
          code: "E0704",
          message: stderrText.length > 0 ? stderrText : "plugin subprocess failed",
        }, false);
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(stdoutText);
      } catch {
        finish({ ok: false, code: "E0704", message: "invalid subprocess response" }, false);
        return;
      }
      if (!isSubprocessResponse(data)) {
        finish({ ok: false, code: "E0704", message: "invalid subprocess response" }, false);
        return;
      }
      if (data.requestId !== request.requestId) {
        finish({ ok: false, code: "E0704", message: "subprocess requestId mismatch" }, false);
        return;
      }
      if (!data.ok) {
        finish({ ok: false, code: "E0704", message: data.message }, false);
        return;
      }
      if (data.effect) {
        if (data.effect.kind === "ui.render") {
          if (renderText) renderText(data.effect.text);
        } else if (data.effect.kind === "debug.log") {
          console.error(data.effect.message);
        } else {
          finish({ ok: false, code: "E0704", message: "unknown subprocess effect" }, false);
          return;
        }
      }
      finish({ ok: true }, false);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      finish({ ok: false, code: "E0704", message }, false);
    });
  });
}

async function readStreamText(
  stream: ReadableStream<Uint8Array>,
  limitBytes?: number,
  streamName = "stream",
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (limitBytes !== undefined && total > limitBytes) {
        throw new Error(`plugin ${streamName} exceeds max bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function isSubprocessResponse(value: unknown): value is SubprocessResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.contractVersion !== 1) return false;
  if (typeof v.requestId !== "string" || v.requestId.length === 0) return false;
  if (typeof v.ok !== "boolean") return false;
  if (v.ok === false) return typeof v.message === "string";
  if (v.effect === undefined) return true;
  if (typeof v.effect !== "object" || v.effect === null) return false;
  const effect = v.effect as Record<string, unknown>;
  if (effect.kind === "ui.render") return typeof effect.text === "string";
  if (effect.kind === "debug.log") return typeof effect.message === "string";
  return false;
}
