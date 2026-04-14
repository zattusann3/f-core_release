import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, args: PluginArgs): void {
  const effectType = args["type"];
  const targetId = args["targetId"];
  const value = args["value"];

  if (effectType !== "shake" && effectType !== "color") {
    throw new Error("effect.type must be 'shake' or 'color'");
  }
  if (typeof targetId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) {
    throw new Error("effect.targetId must be a valid id");
  }
  if (!(typeof value === "string" || typeof value === "number")) {
    throw new Error("effect.value must be string or number");
  }

  if (effectType === "shake") {
    const intensity = asShakeIntensity(value);
    context.ui.dispatch({
      type: "UpdateCSSVar",
      targetId,
      vars: {
        "--fc-shake-intensity": intensity,
        "--fc-shake-play-state": intensity > 0 ? "running" : "paused",
      },
    });
    context.next();
    return;
  }

  context.ui.dispatch({
    type: "UpdateCSSVar",
    targetId,
    vars: {
      "--fc-text-color": String(value),
    },
  });
  context.next();
}

function asShakeIntensity(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("effect.value must be a non-negative number for shake");
  }
  return numeric;
}
