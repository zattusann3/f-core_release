import type { PluginArgs, PluginContext } from "../types.ts";

const ASSET_SRC_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function execute(context: PluginContext, args: PluginArgs): void {
  const assetType = args["type"];
  const rawSrc = args["src"];

  if (assetType !== "bg" && assetType !== "fg") {
    throw new Error("asset.type must be 'bg' or 'fg'");
  }
  if (typeof rawSrc !== "string" || !isSafeAssetSrc(rawSrc)) {
    throw new Error("asset.src must be a safe filename");
  }

  const layerId = assetType === "bg" ? "fc-bg-layer" : "fc-fg-layer";
  const seqKey = assetType === "bg" ? "asset_bg_seq" : "asset_fg_seq";
  const previousSeq = context.vars.get(seqKey);
  const nextSeq = typeof previousSeq === "number" ? previousSeq + 1 : 1;

  context.vars.set(seqKey, nextSeq);
  context.vars.set(`last_${assetType}_asset`, rawSrc);

  context.ui.dispatch({
    type: "ClearSubtree",
    targetId: layerId,
  });
  context.ui.dispatch({
    type: "AppendNode",
    parentId: layerId,
    nodeId: `fc-${assetType}-asset-${nextSeq}`,
    tag: "img",
    src: rawSrc,
  });
  context.next();
}

function isSafeAssetSrc(src: string): boolean {
  if (!ASSET_SRC_RE.test(src)) {
    return false;
  }
  if (src.includes("..") || src.includes("/") || src.includes("\\")) {
    return false;
  }
  return true;
}
