export type PluginManifest = {
  capabilities: string[];
  primitives: string[];
};

export type PrimitiveToCapability = Record<string, string>;

export type CapabilityCheckResult =
  | { ok: true }
  | { ok: false; message: string };

export type ManifestValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validatePrimitiveAccess(
  manifest: PluginManifest,
  primitive: string,
  primitiveToCapability: PrimitiveToCapability,
): CapabilityCheckResult {
  const declaredPrimitive = manifest.primitives.includes(primitive);
  if (!declaredPrimitive) {
    return { ok: false, message: `primitive not declared: ${primitive}` };
  }

  const required = primitiveToCapability[primitive];
  if (!required) {
    return { ok: false, message: `unknown primitive: ${primitive}` };
  }

  const declaredCapability = manifest.capabilities.includes(required);
  if (!declaredCapability) {
    return { ok: false, message: `capability not declared: ${required}` };
  }

  return { ok: true };
}

export function validateManifest(
  manifest: PluginManifest,
  primitiveToCapability: PrimitiveToCapability,
): ManifestValidationResult {
  const errors: string[] = [];
  const allowedCapabilities = new Set(Object.values(primitiveToCapability));

  const capSet = new Set<string>();
  for (const cap of manifest.capabilities) {
    if (capSet.has(cap)) errors.push(`duplicate capability: ${cap}`);
    capSet.add(cap);
    if (!allowedCapabilities.has(cap)) errors.push(`unknown capability: ${cap}`);
  }

  const primSet = new Set<string>();
  for (const prim of manifest.primitives) {
    if (primSet.has(prim)) errors.push(`duplicate primitive: ${prim}`);
    primSet.add(prim);
    const required = primitiveToCapability[prim];
    if (!required) {
      errors.push(`unknown primitive: ${prim}`);
      continue;
    }
    if (!capSet.has(required)) {
      errors.push(`missing capability for primitive: ${prim} (${required})`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}
