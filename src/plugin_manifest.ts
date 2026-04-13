export interface PluginManifestEntry {
  sha256: string;
}

export type PluginManifest = Record<string, PluginManifestEntry>;

// Signature over canonical JSON of PLUGIN_MANIFEST
export const PLUGIN_MANIFEST_SIGNATURE_BASE64 =
  "wA4kQzqH4fEFz6lk+Ue1iSjdt6DwCSBflToMw/HPVPzzqKSk77VJF7ePoi7sLYRacxLvs6uyvX54CIlKCiaQDg==";

// SHA-256 values are for raw plugin source text under ./src/plugins/*.ts
export const PLUGIN_MANIFEST: PluginManifest = {
  choice: {
    sha256: "a034ce56d0be7b5b8e9cd3bb1a1011c39ecfc046ffe726466ad979ee9e8a5499",
  },
  conflict: {
    sha256: "20b18cce5e86b7401eba0b1e46194c2e7f438060c338d1dd9a5b847f64f18c61",
  },
  hang: {
    sha256: "61293cf1c0a88b8799e9c1bd90f745d0321e6366a4e2af000eb36b4606fb4f2b",
  },
  say: {
    sha256: "79615ad9e09a614ee5ff0cb31e97086bd0972b55b25ee74b42705913ce77f574",
  },
  set: {
    sha256: "c112d218d36e69e05b373c50f5e6e2b3ae70177c3c5e9c54965529a83cdbc7b0",
  },
};
