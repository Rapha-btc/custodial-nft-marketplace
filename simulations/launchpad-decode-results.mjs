// Decode + summarize results of the launchpad trait sim using stxer v1 API.
import { deserializeCV, cvToString } from "@stacks/transactions";
import { writeFileSync } from "node:fs";

const SESSION = process.argv[2];
if (!SESSION) { console.error("usage: node launchpad-decode-results.mjs <sessionId>"); process.exit(1); }

const TESTS = [
  "leo-cats-mkt",
  "miami-degens-mkt",
  "drone-wars-uaps-mkt",
  "deruptars-mkt",
  "stacks-pops-mkt",
  "saints-mkt",
  "early-eagles-v2-mkt",
];

const r = await fetch(`https://api.stxer.xyz/simulations/${SESSION}`);
if (!r.ok) { console.error(`HTTP ${r.status}: ${await r.text()}`); process.exit(1); }
const data = await r.json();
writeFileSync("/tmp/launchpad-sim-raw.json", JSON.stringify(data, null, 2));

const steps = data.result?.steps || [];
console.log(`Total steps: ${steps.length}`);
console.log(`Block: ${data.result?.block_height} ${data.result?.block_hash?.slice(0, 12)}…\n`);

function summarizeStep(s) {
  const r = s.receipt;
  if (!r) return { kind: "?", ok: false, summary: "no receipt" };

  // Contract deploys have contract_analysis, calls have transaction
  if (r.contract_analysis) {
    const id = r.contract_analysis.contract_identifier;
    return { kind: "deploy", ok: true, summary: `deployed ${id?.name}` };
  }

  // Try several common result locations
  const resultHex = r.result || r.transaction?.result || s.result;
  const aborted = r.post_condition_aborted || r.transaction?.post_condition_aborted;
  const vmErr = r.vm_error || r.transaction?.vm_error;

  let decoded = "?";
  if (resultHex) {
    try {
      const cv = deserializeCV(resultHex.startsWith("0x") ? resultHex : "0x" + resultHex);
      decoded = cvToString(cv);
    } catch (e) { decoded = `(decode err) hex=${resultHex.slice(0, 30)}…`; }
  }
  const ok = !aborted && !vmErr && decoded.startsWith("(ok");
  const tag = (aborted ? "PC-ABORT " : "") + (vmErr ? `VM:${vmErr.slice(0,40)} ` : "");
  return { kind: "call", ok, summary: tag + decoded };
}

const PER = 4;
const LABELS = ["1.deploy        ", "2.initialize    ", "3.whitelist-sbtc", "4.list-nft      "];

const verdicts = [];
for (let i = 0; i < TESTS.length; i++) {
  console.log(`=== ${TESTS[i]} ===`);
  let allOk = true;
  let listOk = false;
  for (let j = 0; j < PER; j++) {
    const idx = i * PER + j;
    const s = steps[idx];
    if (!s) { console.log(`  ${LABELS[j]} (missing)`); allOk = false; continue; }
    const v = summarizeStep(s);
    console.log(`  ${LABELS[j]} ${v.summary}`);
    if (!v.ok) allOk = false;
    if (j === 3 && v.ok) listOk = true;
  }
  verdicts.push({ mkt: TESTS[i], allOk, listOk });
  console.log("");
}

console.log("=== SUMMARY ===");
for (const v of verdicts) {
  const verdict = v.listOk ? "✅ trait+transfer OK" : "❌ FAILED at list-nft";
  console.log(`  ${v.mkt.padEnd(25)} ${verdict}`);
}
console.log(`\nview: https://stxer.xyz/simulations/mainnet/${SESSION}`);
console.log(`raw saved: /tmp/launchpad-sim-raw.json`);
