export interface PluginManifestEntry {
  sha256: string;
}

export type PluginManifest = Record<string, PluginManifestEntry>;

// Signature over canonical JSON of PLUGIN_MANIFEST
export const PLUGIN_MANIFEST_SIGNATURE_BASE64 =
  "lDSp5Hw2AV/r8gwV03j0dwjzosyTg39jFqlBptB8VpYonKjtvSVEj4CH6AWbgHZanDgqkmH4PIv+AlRUKqDyDg==";

// SHA-256 values are for raw plugin source text under ./src/plugins/*.ts
export const PLUGIN_MANIFEST: PluginManifest = {
  asset: {
    sha256: "c506b1f42479393a43d1f530738ccdd3531d8ad79548dd8f2e0766422a2a3300",
  },
  choice: {
    sha256: "a034ce56d0be7b5b8e9cd3bb1a1011c39ecfc046ffe726466ad979ee9e8a5499",
  },
  conflict: {
    sha256: "20b18cce5e86b7401eba0b1e46194c2e7f438060c338d1dd9a5b847f64f18c61",
  },
  effect: {
    sha256: "7a7369561ee3ffac1bdc13f27489d2c9bf096e1a9f751cd4d3977e32d62d276a",
  },
  hang: {
    sha256: "61293cf1c0a88b8799e9c1bd90f745d0321e6366a4e2af000eb36b4606fb4f2b",
  },
  menu: {
    sha256: "f218e76504808fd6fcf7a64ec2d92f423192eaf9aa5681a544ba58b1557110db",
  },
  say: {
    sha256: "8e28f789f4ed274fe26b5ff7929aec8765ba71f2208126b8cbbe6ade2b0fe592",
  },
  set: {
    sha256: "c112d218d36e69e05b373c50f5e6e2b3ae70177c3c5e9c54965529a83cdbc7b0",
  },
};
