export interface PluginManifestEntry {
  sha256: string;
}

export type PluginManifest = Record<string, PluginManifestEntry>;

// Signature over canonical JSON of PLUGIN_MANIFEST
export const PLUGIN_MANIFEST_SIGNATURE_BASE64 =
  "s0B/0EEGOZJY0frtABzID/RTC+teFcMk5MGIWYAg9MX8/v8Tpek2WPCEBmBWCfM0hEuJdOvdEmg7q43q9/9gDA==";

// SHA-256 values are for raw plugin source text under ./src/plugins/*.ts
export const PLUGIN_MANIFEST: PluginManifest = {
  asset: {
    sha256: "19364c3beb3a8d8873d1260334be7c1db8578100e0de16d0601921a8ec8e0d70",
  },
  choice: {
    sha256: "a034ce56d0be7b5b8e9cd3bb1a1011c39ecfc046ffe726466ad979ee9e8a5499",
  },
  effect: {
    sha256: "7a7369561ee3ffac1bdc13f27489d2c9bf096e1a9f751cd4d3977e32d62d276a",
  },
  menu: {
    sha256: "cded1a658bf5eedf82ba447222aa2289711477c933cf54af19238305c7be073a",
  },
  say: {
    sha256: "8ef3fd55fbf01e4ee135b43d0ac8da4d11dec16821673d5c7883bd532ada7641",
  },
  set: {
    sha256: "76d84974c7d268b0d766503b56f4c1f4685a25324cb85404f79a34f15cb595e7",
  },
};
