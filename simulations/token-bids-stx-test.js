// token-bids-stx-test.js
// stxer harness for fakfun-market-registry + fakfun-token-bids-stx (NOT
// deployed): deploys both from ./contracts at mainnet tip, registers the
// market, then walks standing per-token bids:
// increment rule (max 2% / 1 STX), top-2 escrow with refund of everyone else,
// own-raise pays the difference, second re-bids, cancel top -> second promoted,
// accept -> NFT to top / second refunded / fee split, pause, set-min-increment.
//   node simulations/token-bids-stx-test.js            (in-sim deploy)
//   DEPLOYED=1 node simulations/token-bids-stx-test.js (live contracts)
import fs from "node:fs";
import { uintCV, principalCV, contractPrincipalCV, boolCV, stringAsciiCV, noneCV, deserializeCV, cvToString, ClarityVersion } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const NODE = "http://77.42.3.101/stacks-api";
const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";   // Bitcoin Pepe 964/967/1654/901
const B1 = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";       // ~2,300 STX liquid
const B2 = "SM2J5VCY4DCFX6VZYDANHMXA3VN9DMWYCEK7Y8D93";       // ~7,100 STX liquid
const RANDOM = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";   // 0.04 STX
const ROYALTY = "SP3A4CP63QJB1R0EJR3TJ1PN16FC5HVJSPT77C8C0";
const PLATFORM = "SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE";
const NAME = "fakfun-token-bids-stx";
const CID = `${ADMIN}.${NAME}`;
const REG = "fakfun-market-registry";
const RID = `${ADMIN}.${REG}`;
const BPEPE = ["SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ", "bitcoin-pepe"];
const OTHER = principalCV("SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.sbtc-fakfun-amm-lp-v1");
const cp = ([a, n]) => contractPrincipalCV(a, n);
const nft = principalCV(BPEPE.join("."));
const STX = (n) => Math.round(n * 1_000_000);

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
const call = (label, sender, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const reg = (label, sender, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: RID, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
const evalc = (label, code, capture) => { b.addEvalCode(CID, code); plan.push({ kind: "eval", label, capture }); };
const stxBal = (who) => `(stx-get-balance '${who})`;
const owner = (i) => `(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-owner u${i})`;
const bidOf = (i) => `(get-token-bid '${BPEPE.join(".")} u${i})`;
const bid = (label, sender, id, amt, expect) => call(label, sender, "place-bid", [nft, uintCV(id), uintCV(STX(amt))], expect);
const cancel = (label, sender, id, expect) => call(label, sender, "cancel-bid", [nft, uintCV(id)], expect);
const accept = (label, sender, id, expect) => call(label, sender, "accept-bid", [uintCV(id), cp(BPEPE)], expect);

// DEPLOYED=1 -> run against the live SPV9K21… contracts at mainnet tip
// (deployed 2026-08-28); default deploys the ./contracts sources in-sim.
if (!process.env.DEPLOYED) {
  for (const n of [REG, NAME]) {
    b.withSender(ADMIN).addContractDeploy({ contract_name: n, source_code: fs.readFileSync(`./contracts/${n}.clar`, "utf8"), clarity_version: ClarityVersion.Clarity4 });
    plan.push({ kind: "tx", label: `deploy ${n}`, expect: "(ok true)" });
  }
}

reg("random cannot whitelist", RANDOM, "set-collection", [nft, boolCV(true), uintCV(250), principalCV(ROYALTY)], "(err u300)");
reg("admin whitelists bitcoin-pepe 2.5%", ADMIN, "set-collection", [nft, boolCV(true), uintCV(250), principalCV(ROYALTY)], "(ok true)");
bid("market not registered -> paused (u301)", B1, 964, 10, "(err u301)");
evalc("unregistered market not live", "(is-live)");
reg("random cannot register market", RANDOM, "set-market", [principalCV(CID), boolCV(true)], "(err u300)");
reg("admin registers token-bids market", ADMIN, "set-market", [principalCV(CID), boolCV(true)], "(ok true)");
reg("direct log from a non-market refused", RANDOM, "log", [stringAsciiCV("x"), nft, uintCV(1), uintCV(0), principalCV(RANDOM), noneCV(), uintCV(0), uintCV(0), uintCV(0), uintCV(0)], "(err u318)");
evalc("registry quote 100 STX on bitcoin-pepe", `(contract-call? '${RID} quote '${BPEPE.join(".")} u${STX(100)})`);
evalc("min-increment default", "(get-min-increment)");
evalc("min-next-bid 10 STX -> 11", `(min-next-bid u${STX(10)})`);
evalc("min-next-bid 100 STX -> 102", `(min-next-bid u${STX(100)})`);

for (const [k, w] of [["S0", SELLER], ["A0", B1], ["Z0", B2], ["R0", ROYALTY], ["P0", PLATFORM], ["C0", CID]]) evalc(`${k} balance`, stxBal(w), k);

// ---- increment + top-2 escrow on #964 ----
call("unknown collection", B1, "place-bid", [OTHER, uintCV(964), uintCV(STX(10))], "(err u302)");
bid("zero amount", B1, 964, 0, "(err u304)");
bid("B1 10 STX on #964 (first)", B1, 964, 10, "(ok true)");
evalc("escrow 10", stxBal(CID), "C1");
bid("B1 10.5 rejected (need 11)", B1, 964, 10.5, "(err u320)");
bid("B2 11 -> top B2, second B1", B2, 964, 11, "(ok true)");
evalc("bid #964: top B2 11 / second B1 10", bidOf(964));
evalc("escrow 21", stxBal(CID), "C2");
bid("B1 11.5 rejected (need 12)", B1, 964, 11.5, "(err u320)");
bid("B1 (second) 12 -> top B1, second B2, B1's old 10 refunded", B1, 964, 12, "(ok true)");
evalc("bid #964: top B1 12 / second B2 11", bidOf(964));
evalc("escrow 23", stxBal(CID), "C3");
bid("B1 raises own to 13 (pays +1)", B1, 964, 13, "(ok true)");
evalc("escrow 24", stxBal(CID), "C4");
bid("RANDOM has no STX", RANDOM, 964, 14, "(err u1)");
bid("B2 100 -> top B2, second B1 13, B2's old 11 refunded", B2, 964, 100, "(ok true)");
evalc("escrow 113", stxBal(CID), "C5");
bid("B2 own raise 101 rejected (need 102)", B2, 964, 101, "(err u320)");
bid("B2 own raise 102", B2, 964, 102, "(ok true)");
evalc("escrow 115", stxBal(CID), "C6");

// ---- cancel ----
cancel("RANDOM cannot cancel", RANDOM, 964, "(err u307)");
cancel("no bid on #1", RANDOM, 1, "(err u306)");
cancel("B1 (second) cancels -> refund 13", B1, 964, "(ok true)");
evalc("bid #964: top B2 102 / second none", bidOf(964));
evalc("escrow 102", stxBal(CID), "C7");
bid("B1 104 rejected (need 104.04)", B1, 964, 104, "(err u320)");
bid("B1 104.04 -> top", B1, 964, 104.04, "(ok true)");
evalc("escrow 206.04", stxBal(CID), "C8");
cancel("B1 (top) cancels -> B2 promoted", B1, 964, "(ok true)");
evalc("bid #964: top B2 102 / second none", bidOf(964));
evalc("escrow 102", stxBal(CID), "C9");

// ---- accept ----
evalc("quote-fill #964", `(quote-fill '${BPEPE.join(".")} u964)`);
accept("B2 cannot fill own", B2, 964, "(err u311)");
accept("RANDOM does not own #964", RANDOM, 964, "(err u1)");
accept("no bid on #1", SELLER, 1, "(err u306)");
accept("seller accepts 102 for #964", SELLER, 964, "(ok true)");
evalc("#964 -> B2", owner(964));
evalc("bid #964 gone", bidOf(964));
evalc("escrow 0", stxBal(CID), "C10");
accept("cannot accept twice", SELLER, 964, "(err u306)");

// ---- accept with a second standing: second refunded ----
bid("B1 20 on #967", B1, 967, 20, "(ok true)");
bid("B2 25 on #967", B2, 967, 25, "(ok true)");
evalc("escrow 45", stxBal(CID), "C11");
accept("seller accepts 25 for #967, B1 refunded 20", SELLER, 967, "(ok true)");
evalc("#967 -> B2", owner(967));
evalc("escrow 0", stxBal(CID), "C12");

// ---- pause ----
bid("B1 5 on #1654", B1, 1654, 5, "(ok true)");
reg("admin pauses registry (global)", ADMIN, "set-paused", [boolCV(true)], "(ok true)");
evalc("market not live", "(is-live)");
bid("no bids while registry paused", B2, 1654, 6, "(err u301)");
accept("no accept while registry paused", SELLER, 1654, "(err u301)");
reg("admin unpauses registry", ADMIN, "set-paused", [boolCV(false)], "(ok true)");
reg("admin unregisters this market only", ADMIN, "set-market", [principalCV(CID), boolCV(false)], "(ok true)");
evalc("market not live", "(is-live)");
bid("no bids while unregistered", B2, 1654, 6, "(err u301)");
cancel("cancel works while unregistered", B1, 1654, "(ok true)");
reg("admin re-registers market", ADMIN, "set-market", [principalCV(CID), boolCV(true)], "(ok true)");
evalc("market live again", "(is-live)");

// ---- set-min-increment ----
call("random cannot set increment", RANDOM, "set-min-increment", [uintCV(500), uintCV(STX(2))], "(err u300)");
call("bps above 10% rejected", ADMIN, "set-min-increment", [uintCV(1001), uintCV(STX(2))], "(err u313)");
call("abs above 100 STX rejected", ADMIN, "set-min-increment", [uintCV(500), uintCV(STX(101))], "(err u313)");
call("admin sets 5% / 2 STX", ADMIN, "set-min-increment", [uintCV(500), uintCV(STX(2))], "(ok true)");
evalc("min-increment now", "(get-min-increment)");
evalc("min-next-bid 10 -> 12", `(min-next-bid u${STX(10)})`);
bid("B1 10 on #901", B1, 901, 10, "(ok true)");
bid("B2 11.9 rejected (need 12)", B2, 901, 11.9, "(err u320)");
bid("B2 12", B2, 901, 12, "(ok true)");
cancel("B2 cancels", B2, 901, "(ok true)");
cancel("B1 cancels", B1, 901, "(ok true)");
evalc("bid #901 gone", bidOf(901));

// ---- un-whitelist blocks bids but not accept/cancel of existing ----
bid("B1 3 on #1654", B1, 1654, 3, "(ok true)");
reg("admin disables bitcoin-pepe", ADMIN, "set-collection", [nft, boolCV(false), uintCV(250), principalCV(ROYALTY)], "(ok true)");
bid("no new bids", B2, 1654, 5, "(err u302)");
accept("accept blocked while disabled", SELLER, 1654, "(err u302)");
cancel("cancel still works", B1, 1654, "(ok true)");

// ---- admin handover lives in the registry and flows to the market ----
reg("admin proposes B1", ADMIN, "propose-fakfun", [principalCV(B1)], "(ok true)");
reg("too early", B1, "accept-fakfun", [], "(err u316)");
advance(144);
reg("B1 accepts after 144", B1, "accept-fakfun", [], "(ok true)");
call("old admin cannot set increment on market", ADMIN, "set-min-increment", [uintCV(200), uintCV(STX(1))], "(err u300)");
call("new admin can", B1, "set-min-increment", [uintCV(200), uintCV(STX(1))], "(ok true)");

for (const [k, w] of [["S1", SELLER], ["A1", B1], ["Z1", B2], ["R1", ROYALTY], ["P1", PLATFORM], ["C13", CID]]) evalc(`${k} balance final`, stxBal(w), k);

const dtx = (s) => { const t = s?.Result?.Transaction; if (!t) return "<none>"; if ("Err" in t) return `ENGINE-ERR: ${t.Err}`; try { return cvToString(deserializeCV(t.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; } };
const dev = (s) => { const t = s?.Result?.Eval; if (!t) return "<none>"; if (!("Ok" in t)) return `ERR: ${t.Err}`; try { return cvToString(deserializeCV(t.Ok)); } catch { return t.Ok; } };
const u = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
const sessionId = await b.run();
const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
console.log(`Submitted ${url}\n`);
const res = await getSimulationResult(sessionId);
const cap = {}; let pass = 0, fail = 0;
res.steps.forEach((s, i) => {
  const p = plan[i]; if (!p) return;
  if (p.kind === "tx") { const got = dtx(s); const ok = got === p.expect; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
  else if (p.kind === "eval") { const v = dev(s); if (p.capture) cap[p.capture] = v; console.log(`ℹ️  [${i}] ${p.label}: ${v}`); }
  else console.log(`⏩ [${i}] ${p.label}`);
});
const d = (a, b0) => u(cap[a]) - u(cap[b0]);
// fills: #964 at 102, #967 at 25 -> 127 STX gross; 2.5% royalty + 2.5% platform
const between = (x, lo, hi) => x > lo && x <= hi;
const checks = [
  ["escrow C1 = 10", d("C1", "C0"), BigInt(STX(10))],
  ["escrow C2 = 21", d("C2", "C0"), BigInt(STX(21))],
  ["escrow C3 = 23", d("C3", "C0"), BigInt(STX(23))],
  ["escrow C4 = 24", d("C4", "C0"), BigInt(STX(24))],
  ["escrow C5 = 113", d("C5", "C0"), BigInt(STX(113))],
  ["escrow C6 = 115", d("C6", "C0"), BigInt(STX(115))],
  ["escrow C7 = 102", d("C7", "C0"), BigInt(STX(102))],
  ["escrow C8 = 206.04", d("C8", "C0"), BigInt(STX(206.04))],
  ["escrow C9 = 102", d("C9", "C0"), BigInt(STX(102))],
  ["escrow C10 = 0", d("C10", "C0"), 0n],
  ["escrow C11 = 45", d("C11", "C0"), BigInt(STX(45))],
  ["escrow C12 = 0", d("C12", "C0"), 0n],
  ["contract holds nothing at end", d("C13", "C0"), 0n],
  ["seller +120.65 STX minus tx fees", between(d("S1", "S0"), BigInt(STX(120)), BigInt(STX(120.65))), true],
  ["B2 -127 STX minus tx fees", between(d("Z1", "Z0"), BigInt(STX(-128)), BigInt(STX(-127))), true],
  ["B1 only paid tx fees", between(d("A1", "A0"), BigInt(STX(-1)), 0n), true],
  ["royalty +3.175", d("R1", "R0"), BigInt(STX(3.175))],
  ["platform +3.175", d("P1", "P0"), BigInt(STX(3.175))],
];
for (const [label, got, want] of checks) { const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (want ${want})`); ok ? pass++ : fail++; }
console.log(`\n=== ${pass} passed, ${fail} failed ===\n${url}`);
if (fail > 0) process.exit(1);
