type SubprocessRequest = {
  contractVersion: 1;
  requestId: string;
  primitive: string;
  attrs: Record<string, string>;
};

type SubprocessResponse =
  | {
    contractVersion: 1;
    requestId: string;
    ok: true;
    effect?: { kind: "ui.render"; text: string } | { kind: "debug.log"; message: string };
  }
  | { contractVersion: 1; requestId: string; ok: false; message: string };

const INVALID_REQUEST_ID = "invalid-request";

const input = await readStdinText();
let requestRaw: unknown;
try {
  requestRaw = JSON.parse(input);
} catch {
  writeResponse({
    contractVersion: 1,
    requestId: INVALID_REQUEST_ID,
    ok: false,
    message: "invalid subprocess request",
  });
  Deno.exit(1);
}

if (!isSubprocessRequest(requestRaw)) {
  writeResponse({
    contractVersion: 1,
    requestId: INVALID_REQUEST_ID,
    ok: false,
    message: "invalid subprocess request",
  });
  Deno.exit(1);
}

const response = await executePrimitive(
  requestRaw.requestId,
  requestRaw.primitive,
  requestRaw.attrs,
);
writeResponse(response);
if (!response.ok) Deno.exit(1);

async function executePrimitive(
  requestId: string,
  primitive: string,
  attrs: Record<string, string>,
): Promise<SubprocessResponse> {
  if (primitive === "ui.render") {
    return {
      contractVersion: 1,
      requestId,
      ok: true,
      effect: { kind: "ui.render", text: attrs.text ?? "" },
    };
  }
  if (primitive === "debug.log") {
    return {
      contractVersion: 1,
      requestId,
      ok: true,
      effect: { kind: "debug.log", message: attrs.message ?? "" },
    };
  }
  if (primitive === "time.sleep") {
    const busyMsRaw = attrs.busyMs;
    if (busyMsRaw !== undefined) {
      const busyMs = Number.parseInt(busyMsRaw, 10);
      if (!Number.isFinite(busyMs) || busyMs < 0) {
        return {
          contractVersion: 1,
          requestId,
          ok: false,
          message: "time.sleep busyMs requires non-negative integer",
        };
      }
      const endAt = Date.now() + busyMs;
      while (Date.now() < endAt) {
        // Intentional busy loop to simulate blocking plugin behavior.
      }
    }
    const msRaw = attrs.ms ?? "0";
    const ms = Number.parseInt(msRaw, 10);
    if (!Number.isFinite(ms) || ms < 0) {
      return {
        contractVersion: 1,
        requestId,
        ok: false,
        message: "time.sleep requires non-negative integer ms",
      };
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { contractVersion: 1, requestId, ok: true };
  }
  return {
    contractVersion: 1,
    requestId,
    ok: false,
    message: `unknown plugin primitive: ${primitive}`,
  };
}

async function readStdinText(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Deno.stdin.readable) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged).trim();
}

function writeResponse(response: SubprocessResponse): void {
  console.log(JSON.stringify(response));
}

function isSubprocessRequest(value: unknown): value is SubprocessRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.contractVersion !== 1) return false;
  if (typeof v.requestId !== "string" || v.requestId.length === 0) return false;
  if (typeof v.primitive !== "string") return false;
  if (typeof v.attrs !== "object" || v.attrs === null || Array.isArray(v.attrs)) return false;
  return true;
}
