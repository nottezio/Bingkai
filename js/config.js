export const CONFIG = {
  BUILD: "2026-07-05.1", // bump on each deploy; shown in the status marquee so you
                         // can verify at a glance which build the app is running.
  WORK_MAX: 2048,     // long-edge cap for the working (preview) bitmap
  EXPORT_MAX: 2160,   // short-edge cap for high-res (non-IG) export
  IG_WIDTH: 1080,     // Instagram feed render width — pin to this for zero IG resize
  DPR_CAP: 2.5,       // limit devicePixelRatio to bound stage canvas memory
};
