const OP_NAME_RE = /^[a-z0-9_]+$/;

export async function loadFixturePluginSource(opName: string): Promise<string> {
  if (!OP_NAME_RE.test(opName)) {
    throw new Error("operation denied");
  }

  const url = new URL(`./plugins/${opName}.ts`, import.meta.url);
  return await Deno.readTextFile(url);
}
