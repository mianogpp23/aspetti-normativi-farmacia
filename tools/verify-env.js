/* verify-env.js — configurazione condivisa degli strumenti di verifica. */

export const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8093/").replace(/\/?$/, "/");
export const OUT_DIR = process.env.E2E_OUT || "/tmp/verify-tools";
export const CHROMIUM = process.env.CHROMIUM_PATH || "/snap/bin/chromium";

export const results = [];
results.console = [];
results.pageErrors = [];
results.failedRequests = [];
results.httpErrors = [];
