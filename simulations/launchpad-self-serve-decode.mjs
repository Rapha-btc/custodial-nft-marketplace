// Decode launchpad-self-serve-saints sim
import { deserializeCV, cvToString } from "@stacks/transactions";
import { writeFileSync } from "node:fs";

const SESSION = process.argv[2];
if (!SESSION) { console.error("usage: node launchpad-self-serve-decode.mjs <sessionId>"); process.exit(1); }

const r = await fetch(`https://api.stxer.xyz/simulations/${SESSION}`);
if (!r.ok) { console.error(`HTTP ${r.status}: ${await r.text()}`); process.exit(1); }
const data = await r.json();
writeFileSync("/tmp/launchpad-self-serve-raw.json", JSON.stringify(data, null, 2));

const steps = data.result?.steps || [];
const LABELS = [
  "1. deploy template            ",
  "2. set-verified-contract      ",
  "3. deploy saints-nft-market   ",
  "4. initialize(saints)         ",
  "5. whitelist sBTC             ",
  "6. register-nft-marketplace   ",
  "7. is-marketplace-registered  ",
  "8. get-marketplace-info       ",
  "9. fakfun-nfts-core.list-nft  ",
];

function decode(hex) {
  if (!hex) return "(no result)";
  try { return cvToString(deserializeCV(hex.startsWith("0x") ? hex : "0x" + hex)); }
  catch (e) { return `(decode err: ${e.message})`; }
}

console.log(`steps: ${steps.length}, block ${data.result?.block_height}\n`);
for (let i = 0; i < Math.max(steps.length, LABELS.length); i++) {
  const s = steps[i];
  const label = LABELS[i] || `${i}.`;
  if (!s) { console.log(`  ${label} (missing)`); continue; }
  const r = s.receipt;
  if (!r) { console.log(`  ${label} (no receipt)`); continue; }
  if (r.contract_analysis) {
    const name = r.contract_analysis.contract_identifier?.name;
    console.log(`  ${label} ✓ deployed ${name}`);
    continue;
  }
  const resultHex = r.result;
  const aborted = r.post_condition_aborted;
  const vmErr = r.vm_error;
  const decoded = decode(resultHex);
  const tag = (aborted ? "PC-ABORT " : "") + (vmErr ? `VM:${String(vmErr).slice(0,60)} ` : "");
  console.log(`  ${label} ${tag}${decoded}`);
}

console.log(`\nview: https://stxer.xyz/simulations/mainnet/${SESSION}`);
console.log(`raw:  /tmp/launchpad-self-serve-raw.json`);

// Also dump fakfun-nfts-core print events
const events = [];
for (const s of steps) {
  for (const e of (s.receipt?.events || [])) {
    if (e.event_type === "contract_event" || e.contract_event) {
      const ce = e.contract_event || e;
      if (ce.contract_identifier?.includes("fakfun-nfts-core") || ce.contract_identifier?.endsWith("fakfun-nfts-core")) {
        events.push(ce);
      }
    }
  }
}
if (events.length) {
  console.log("\nfakfun-nfts-core events:");
  for (const e of events) {
    let payload = e.value;
    try { if (typeof payload === "string") payload = cvToString(deserializeCV(payload.startsWith("0x") ? payload : "0x" + payload)); } catch {}
    console.log(`  - ${JSON.stringify(payload).slice(0, 250)}`);
  }
}
