export const M1_SCAN_LIMITS = Object.freeze({
  archiveBytes: 20 * 1024 * 1024,
  expandedBytes: 200 * 1024 * 1024,
  entries: 5000,
  singleEntryBytes: 50 * 1024 * 1024,
  timeoutMs: 5000,
  concurrency: 2
});

// Tiny metadata files can legitimately compress very well; large entries cannot.
export const ZIP_RATIO_THRESHOLD_BYTES = 1024 * 1024;
export const ZIP_MAX_COMPRESSION_RATIO = 200;
