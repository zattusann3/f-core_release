const REPO_ROOT = new URL("../", import.meta.url);
const DEFAULT_OUTPUT = "repo-context.md";

const includeFiles = [
  "README.md",
  "deno.json",
  "deno.lock",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "renderer.html",
  "assets/demo_scenario.md",
  "public/index.html",
  "public/inspector.js",
  "public/renderer.html",
  "public/renderer_app.js",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/build.rs",
  "src-tauri/tauri.conf.json",
];

const includeDirs = [
  "adr",
  "docs",
  "scripts",
  "src",
  "src-tauri/capabilities",
  "src-tauri/src",
  "test",
];

const excludedNames = new Set([
  ".DS_Store",
]);

const outputPath = parseOutputPath(Deno.args);
const paths = await collectContextPaths();
const body = await renderContext(paths);
await Deno.writeTextFile(new URL(outputPath, REPO_ROOT), body);

console.log(`wrote ${outputPath} (${paths.length} files)`);

function parseOutputPath(args: string[]): string {
  const outputFlagIndex = args.indexOf("--out");
  if (outputFlagIndex >= 0) {
    const value = args[outputFlagIndex + 1];
    if (!value) {
      throw new Error("--out requires a file path");
    }
    return normalizeRelativePath(value);
  }

  const positional = args.find((arg) => !arg.startsWith("-"));
  return positional ? normalizeRelativePath(positional) : DEFAULT_OUTPUT;
}

async function collectContextPaths(): Promise<string[]> {
  const found = new Set<string>();

  for (const path of includeFiles) {
    if (await isReadableFile(path)) {
      found.add(path);
    }
  }

  for (const dir of includeDirs) {
    for await (const path of walkFiles(dir)) {
      if (!isGeneratedContextFile(path)) {
        found.add(path);
      }
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const dirUrl = new URL(`${dir}/`, REPO_ROOT);
  try {
    for await (const entry of Deno.readDir(dirUrl)) {
      if (excludedNames.has(entry.name)) continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        yield* walkFiles(path);
      } else if (entry.isFile) {
        yield path;
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(new URL(path, REPO_ROOT));
    return stat.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function renderContext(paths: string[]): Promise<string> {
  const chunks: string[] = [];
  const generatedAt = new Date().toISOString();

  chunks.push(`# f-core20260403 Repository Context`);
  chunks.push("");
  chunks.push(`Generated: ${generatedAt}`);
  chunks.push("");
  chunks.push("This file is a source snapshot for external architecture discussion.");
  chunks.push(
    "Generated artifacts, dependencies, Git metadata, local environment files, and binary assets are intentionally omitted.",
  );
  chunks.push("");
  chunks.push("## Included Tree");
  chunks.push("");
  chunks.push("```text");
  chunks.push(...paths);
  chunks.push("```");
  chunks.push("");
  chunks.push("## Files");
  chunks.push("");

  for (const path of paths) {
    const source = await Deno.readTextFile(new URL(path, REPO_ROOT));
    chunks.push(`### ${path}`);
    chunks.push("");
    chunks.push(openFence(path, source));
    chunks.push(source.trimEnd());
    chunks.push(closeFence(source));
    chunks.push("");
  }

  return `${chunks.join("\n")}\n`;
}

function openFence(path: string, source: string): string {
  return `${fence(source)}${languageForPath(path)}`;
}

function closeFence(source: string): string {
  return fence(source);
}

function fence(source: string): string {
  let longestRun = 0;
  for (const match of source.matchAll(/`+/g)) {
    longestRun = Math.max(longestRun, match[0].length);
  }
  return "`".repeat(Math.max(3, longestRun + 1));
}

function languageForPath(path: string): string {
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".toml")) return "toml";
  if (path.endsWith(".rs")) return "rust";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".lock")) return "";
  return "";
}

function normalizeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) {
    throw new Error(`output path must stay inside repository root: ${path}`);
  }
  return normalized;
}

function isGeneratedContextFile(path: string): boolean {
  return path === DEFAULT_OUTPUT || /^repo-context.*\.(md|txt)$/.test(path);
}
