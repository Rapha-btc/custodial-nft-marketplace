// verify-mainnet.mjs
// SELF-VERIFYING stxer mainnet-fork harness for nft-dispatch.clar.
// A REAL holder (SP3WAA...) batch-sends REAL NFTs from REAL collections
// (bitcoin-pepe, giga-pepe-v2, stacks-invaders-v0, roo-cards, BNS-V2) in one tx each,
// and every owner is checked on-chain afterwards.
//
// Run:  npm run simul:dispatch

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ClarityVersion, uintCV, listCV, tupleCV,
  standardPrincipalCV, contractPrincipalCV,
  deserializeCV, cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const STACKS_API = process.env.STACKS_API || "http://77.42.3.101/stacks-api";

const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const HOLDER   = "SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY"; // real multi-NFT holder
const R1       = "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR"; // recipient 1
const R2       = "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9"; // recipient 2
const STRANGER = "SP000000000000000000002Q6VF78";

const NAME = "nft-dispatch";
const CID  = `${DEPLOYER}.${NAME}`;

const C = {
  pepe:     "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe",
  giga:     "SP2RNHHQDTHGHPEVX83291K4AQZVGWEJ7WCQQDA9R.giga-pepe-v2",
  invaders: "SPV8C2N59MA417HYQNG6372GCV0SEQE01EV4Z1RQ.stacks-invaders-v0",
  roo:      "SP3EB7YHV5NERS2HMCGSGKNMN0BEH52W9H7YE4T9C.roo-cards",
  bns:      "SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF.BNS-V2",
};
const cp = (id) => contractPrincipalCV(...id.split(/\.(.+)/));
const sp = standardPrincipalCV;
const ids = (arr) => listCV(arr.map(uintCV));
const items = (arr) => listCV(arr.map(([id, r]) => tupleCV({ id: uintCV(id), recipient: sp(r) })));
const groups = (arr) => listCV(arr.map(([c, xs]) => tupleCV({ nft: cp(c), ids: ids(xs) })));

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_API });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "..", "contracts", "nft-dispatch.clar"), "utf8");

function call(label, sender, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, expect) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, expect });
}
const ownerIs = (c, id, who) =>
  evalc(`owner ${(C[c] ?? c).split(".")[1]} #${id} == ${who.slice(0, 6)}…`,
    `(contract-call? '${C[c] ?? c} get-owner u${id})`, `(ok (some ${who}))`);

// ---- deploy ----
b.withSender(DEPLOYER).addContractDeploy({
  contract_name: NAME, source_code: src, clarity_version: ClarityVersion.Clarity5,
});
plan.push({ kind: "deploy", label: `deploy ${NAME}` });

// ---- preconditions: HOLDER owns everything we will move ----
for (const id of [1054, 1923, 1447, 255]) ownerIs("pepe", id, HOLDER);
for (const id of [1913, 1665, 1860, 1741]) ownerIs("giga", id, HOLDER);
for (const id of [2873, 3282]) ownerIs("invaders", id, HOLDER);
for (const id of [12, 10, 9]) ownerIs("roo", id, HOLDER);

// ---- guards ----
call("send-many empty list -> ERR_EMPTY u100", HOLDER, "send-many", [cp(C.pepe), items([])], "(err u100)");
call("send-many-to empty list -> ERR_EMPTY u100", HOLDER, "send-many-to", [cp(C.pepe), ids([]), sp(R1)], "(err u100)");
call("send-multi-to no groups -> ERR_EMPTY u100", HOLDER, "send-multi-to", [groups([]), sp(R1)], "(err u100)");
call("send-many-to self -> ERR_SELF_SEND u101", HOLDER, "send-many-to", [cp(C.pepe), ids([1054]), sp(HOLDER)], "(err u101)");
call("send-many with one item to self -> ERR_SELF_SEND u101", HOLDER, "send-many",
  [cp(C.pepe), items([[1054, R1], [1923, HOLDER]])], "(err u101)");
ownerIs("pepe", 1054, HOLDER); // first item rolled back

// stranger cannot move HOLDER's NFTs
call("stranger send-many-to HOLDER's pepe -> err (collection rejects)", STRANGER, "send-many-to",
  [cp(C.pepe), ids([1054]), sp(STRANGER)], /^\(err u\d+\)$/);
ownerIs("pepe", 1054, HOLDER);

// ---- atomicity: owned id + NOT-owned id (pepe #1499 belongs to DEPLOYER) -> whole tx reverts ----
call("send-many-to [1054 owned, 1499 not owned] -> err, nothing moves", HOLDER, "send-many-to",
  [cp(C.pepe), ids([1054, 1499]), sp(R1)], /^\(err u\d+\)$/);
ownerIs("pepe", 1054, HOLDER);
ownerIs("pepe", 1499, DEPLOYER);

// ---- send-many: one collection, per-item recipients ----
call("send-many pepe [1054->R1, 1923->R2, 1447->R1] -> (ok u3)  [ONE TX]", HOLDER, "send-many",
  [cp(C.pepe), items([[1054, R1], [1923, R2], [1447, R1]])], "(ok u3)");
ownerIs("pepe", 1054, R1);
ownerIs("pepe", 1923, R2);
ownerIs("pepe", 1447, R1);
ownerIs("pepe", 255, HOLDER); // untouched

// re-send an already-sent id -> err
call("send-many-to pepe [1054] again (no longer owned) -> err", HOLDER, "send-many-to",
  [cp(C.pepe), ids([1054]), sp(R2)], /^\(err u\d+\)$/);

// ---- send-many-to: one collection, all to one recipient ----
call("send-many-to giga [1913,1665,1860,1741] -> R2 (ok u4)  [ONE TX]", HOLDER, "send-many-to",
  [cp(C.giga), ids([1913, 1665, 1860, 1741]), sp(R2)], "(ok u4)");
for (const id of [1913, 1665, 1860, 1741]) ownerIs("giga", id, R2);

// ---- send-multi-to: many collections, one recipient (portfolio multi-select) ----
call("send-multi-to [invaders 2873,3282 + roo 12,10,9 + pepe 255] -> R1 (ok u6)  [ONE TX, 3 COLLECTIONS]",
  HOLDER, "send-multi-to",
  [groups([[C.invaders, [2873, 3282]], [C.roo, [12, 10, 9]], [C.pepe, [255]]]), sp(R1)], "(ok u6)");
for (const id of [2873, 3282]) ownerIs("invaders", id, R1);
for (const id of [12, 10, 9]) ownerIs("roo", id, R1);
ownerIs("pepe", 255, R1);

// ---- R1 can dispatch onward (recipient is a normal owner) ----
call("R1 send-many-to pepe [1054,1447] -> R2 (ok u2)", R1, "send-many-to",
  [cp(C.pepe), ids([1054, 1447]), sp(R2)], "(ok u2)");
ownerIs("pepe", 1054, R2);
ownerIs("pepe", 1447, R2);

// ---- send-mixed: flat list, each item = own collection + id + recipient ----
// state now: R2 owns pepe 1923,1054,1447 + giga 1913,1665,1860,1741
//            R1 owns invaders 2873,3282 + roo 12,10,9 + pepe 255
const mixed = (arr) => listCV(arr.map(([c, id, r]) =>
  tupleCV({ nft: cp(C[c]), id: uintCV(id), recipient: sp(r) })));

call("send-mixed empty -> ERR_EMPTY u100", R2, "send-mixed", [mixed([])], "(err u100)");
call("send-mixed [pepe 1923->R1, giga 1913->R2(self)] -> u101, nothing moves", R2, "send-mixed",
  [mixed([["pepe", 1923, R1], ["giga", 1913, R2]])], "(err u101)");
ownerIs("pepe", 1923, R2);
call("send-mixed [giga 1913->R1, roo 12 (not R2's)->R1] -> err, nothing moves", R2, "send-mixed",
  [mixed([["giga", 1913, R1], ["roo", 12, R1]])], /^\(err u\d+\)$/);
ownerIs("giga", 1913, R2);
ownerIs("roo", 12, R1);

// many collections, many recipients
call("send-mixed R2 [pepe 1923->R1, giga 1913->HOLDER, giga 1665->R1, pepe 1054->STRANGER] -> (ok u4)  [ONE TX, 2 COLL, 3 RECIPIENTS]",
  R2, "send-mixed",
  [mixed([["pepe", 1923, R1], ["giga", 1913, HOLDER], ["giga", 1665, R1], ["pepe", 1054, STRANGER]])], "(ok u4)");
ownerIs("pepe", 1923, R1);
ownerIs("giga", 1913, HOLDER);
ownerIs("giga", 1665, R1);
ownerIs("pepe", 1054, STRANGER);
ownerIs("giga", 1860, R2); // untouched

// many collections, ONE recipient
call("send-mixed R1 [invaders 2873, roo 12, roo 10, pepe 255] all -> R2 (ok u4)  [ONE TX, 3 COLL, 1 RECIPIENT]",
  R1, "send-mixed",
  [mixed([["invaders", 2873, R2], ["roo", 12, R2], ["roo", 10, R2], ["pepe", 255, R2]])], "(ok u4)");
ownerIs("invaders", 2873, R2);
ownerIs("roo", 12, R2);
ownerIs("roo", 10, R2);
ownerIs("pepe", 255, R2);
ownerIs("roo", 9, R1); // untouched

// ---- BNS-V2 (informational: does its transfer accept a contract-call?) ----
call("INFO: send-many-to BNS-V2 [379302] -> R1", HOLDER, "send-many-to",
  [cp(C.bns), ids([379302]), sp(R1)], undefined);
evalc("INFO: BNS-V2 #379302 owner", `(contract-call? '${C.bns} get-owner u379302)`, undefined);

// =====================================================================
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx result>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); }
  catch (e) { return `decode-failed(${r.Ok?.result}): ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); }
}
const match = (got, expect) => (expect instanceof RegExp ? expect.test(got) : got === expect);

async function main() {
  console.log("=== nft-dispatch SELF-VERIFYING stxer harness (REAL mainnet NFTs) ===\n");
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const { steps } = await getSimulationResult(sessionId);
  let pass = 0, fail = 0;
  steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const got = decodeTx(s);
      const ok = !got.startsWith("ENGINE-ERR") && !got.startsWith("<no");
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${got}`);
      ok ? pass++ : fail++;
      return;
    }
    const got = p.kind === "tx" ? decodeTx(s) : decodeEval(s);
    if (p.expect === undefined) { console.log(`ℹ️  [${i}] ${p.label}: ${got}`); return; }
    const ok = match(got, p.expect);
    console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`);
    ok ? pass++ : fail++;
  });
  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
