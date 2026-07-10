export const CONFIG = {
  BUILD: (typeof self !== "undefined" && self.APP_VERSION) || "dev", // from version.js (single source)
  WORK_MAX: 2048,     // long-edge cap for the working (preview) bitmap
  EXPORT_MAX: 2160,   // short-edge cap for high-res (non-IG) export
  IG_WIDTH: 1080,     // Instagram feed render width — pin to this for zero IG resize
  DPR_CAP: 2.5,       // limit devicePixelRatio to bound stage canvas memory
};
