// auctions-stx-test.js
// stxer harness for fakfun-market-registry + fakfun-auctions-stx (NOT
// deployed): deploys both from ./contracts at mainnet tip, registers the
// market, then walks seller-initiated timed auctions: NFT escrow, reserve /
// duration bounds, increment rule, previous-top refund, own raise, anti-snipe
// extension, bid after end, settle by anyone, expired auction returns NFT,
// cancel only without bids, liar NFT rejected, fee split, balance deltas.
//   node simulations/auctions-stx-test.js
import fs from "node:fs";
import { uintCV, principalCV, contractPrincipalCV, boolCV, deserializeCV, cvToString, ClarityVersion } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const NODE = "http://77.42.3.101/stacks-api";
const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";   // Bitcoin Pepe 964/967/1654/901
const B1 = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";
const B2 = "SM2J5VCY4DCFX6VZYDANHMXA3VN9DMWYCEK7Y8D93";
const RANDOM = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const ROYALTY = "SP3A4CP63QJB1R0EJR3TJ1PN16FC5HVJSPT77C8C0";
const PLATFORM = "SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE";
const NAME = "fakfun-auctions-stx";
const CID = `${ADMIN}.${NAME}`;
const REG = "fakfun-market-registry";
const RID = `${ADMIN}.${REG}`;
const BPEPE = ["SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ", "bitcoin-pepe"];
const LIAR = [RANDOM, "liar-nft"];
const cp = ([a, n]) => contractPrincipalCV(a, n);
const nft = principalCV(BPEPE.join("."));
const STX = (n) => Math.round(n * 1_000_000);

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
const call = (label, sender, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const reg = (label, sender, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: RID, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const evalc = (label, code, capture) => { b.addEvalCode(CID, code); plan.push({ kind: "eval", label, capture }); };
const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
const stxBal = (who) => `(stx-get-balance '${who})`;
const owner = (i) => `(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-owner u${i})`;
const endsAt = (id) => `(get ends-at (unwrap-panic (get-auction u${id})))`;
const create = (label, sender, id, reserve, dur, expect) => call(label, sender, "create-auction", [cp(BPEPE), uintCV(id), uintCV(STX(reserve)), uintCV(dur)], expect);
const bid = (label, sender, a, amt, expect) => call(label, sender, "bid", [uintCV(a), uintCV(STX(amt))], expect);
const settle = (label, sender, a, expect, n = BPEPE) => call(label, sender, "settle", [uintCV(a), cp(n)], expect);
const cancel = (label, sender, a, expect, n = BPEPE) => call(label, sender, "cancel-auction", [uintCV(a), cp(n)], expect);

for (const n of [REG, NAME]) {
  b.withSender(ADMIN).addContractDeploy({ contract_name: n, source_code: fs.readFileSync(`./contracts/${n}.clar`, "utf8"), clarity_version: ClarityVersion.Clarity4 });
  plan.push({ kind: "tx", label: `deploy ${n}`, expect: "(ok true)" });
}
b.withSender(RANDOM).addContractDeploy({ contract_name: LIAR[1], clarity_version: ClarityVersion.Clarity4, source_code: `(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(define-read-only (get-last-token-id) (ok u9999))
(define-read-only (get-token-uri (id uint)) (ok none))
(define-read-only (get-owner (id uint)) (ok (some tx-sender)))
(define-public (transfer (id uint) (from principal) (to principal)) (ok true))` });
plan.push({ kind: "tx", label: "deploy liar-nft (transfer always ok)", expect: "(ok true)" });

reg("admin whitelists bitcoin-pepe 2.5%", ADMIN, "set-collection", [nft, boolCV(true), uintCV(250), principalCV(ROYALTY)], "(ok true)");
create("market not registered -> paused", SELLER, 964, 10, 144, "(err u301)");
reg("admin registers auctions market", ADMIN, "set-market", [principalCV(CID), boolCV(true)], "(ok true)");

for (const [k, w] of [["S0", SELLER], ["A0", B1], ["Z0", B2], ["R0", ROYALTY], ["P0", PLATFORM], ["C0", CID]]) evalc(`${k} balance`, stxBal(w), k);

// ---- create ----
call("unknown collection", SELLER, "create-auction", [cp(LIAR), uintCV(1), uintCV(STX(10)), uintCV(144)], "(err u302)");
create("zero reserve", SELLER, 964, 0, 144, "(err u304)");
create("duration 0 too short", SELLER, 964, 10, 0, "(err u325)");
create("duration 1009 too long", SELLER, 964, 10, 1009, "(err u325)");
create("RANDOM does not own #964", RANDOM, 964, 10, 144, "(err u1)");
create("seller auctions #964, reserve 10, 144 blocks -> #1", SELLER, 964, 10, 144, "(ok u1)");
evalc("#964 escrowed in contract", owner(964));
evalc("auction 1", "(get-auction u1)");
evalc("quote-auction 1 (no bids, min-next = reserve)", "(quote-auction u1)");

// ---- bid ----
bid("no such auction", B1, 9, 10, "(err u322)");
bid("below reserve", B1, 1, 9.99, "(err u320)");
bid("seller cannot bid", SELLER, 1, 10, "(err u311)");
bid("RANDOM has no STX", RANDOM, 1, 10, "(err u1)");
bid("B1 10 (reserve)", B1, 1, 10, "(ok true)");
evalc("escrow 10", stxBal(CID), "C1");
bid("B2 10.5 rejected (need 11)", B2, 1, 10.5, "(err u320)");
bid("B2 12 -> B1 refunded", B2, 1, 12, "(ok true)");
evalc("escrow 12", stxBal(CID), "C2");
bid("B2 own raise 12.5 rejected (need 13)", B2, 1, 12.5, "(err u320)");
bid("B2 own raise 20 pays +8", B2, 1, 20, "(ok true)");
evalc("escrow 20", stxBal(CID), "C3");
bid("B1 20.4 rejected (need 21)", B1, 1, 20.4, "(err u320)");
settle("settle while live", RANDOM, 1, "(err u324)");
cancel("seller cannot cancel with bids", SELLER, 1, "(err u326)");

// ---- anti-snipe ----
evalc("ends-at before snipe", endsAt(1), "E0");
advance(139);
bid("B1 21 with 5 blocks left -> extends", B1, 1, 21, "(ok true)");
evalc("ends-at after snipe (= now + 6)", endsAt(1), "E1");
evalc("escrow 21", stxBal(CID), "C4");
advance(3);
bid("B2 22 with 3 left -> extends again", B2, 1, 22, "(ok true)");
evalc("ends-at after 2nd snipe", endsAt(1), "E2");
advance(6);
bid("B1 23 after end", B1, 1, 23, "(err u323)");
evalc("quote-auction 1 ended", "(quote-auction u1)");

// ---- settle ----
settle("settle with liar NFT -> wrong nft", RANDOM, 1, "(err u308)", LIAR);
settle("RANDOM settles for B2 at 22", RANDOM, 1, "(ok true)");
evalc("#964 -> B2", owner(964));
evalc("auction 1 gone", "(get-auction u1)");
settle("settle twice", RANDOM, 1, "(err u322)");
evalc("escrow 0", stxBal(CID), "C5");

// ---- expired, no bids -> NFT back ----
create("seller auctions #967 reserve 5, 36 blocks -> #2", SELLER, 967, 5, 36, "(ok u2)");
settle("not ended yet", SELLER, 2, "(err u324)");
advance(36);
settle("expired: settle returns NFT to seller", B1, 2, "(ok true)");
evalc("#967 back to seller", owner(967));

// ---- cancel without bids ----
create("seller auctions #1654 -> #3", SELLER, 1654, 5, 144, "(ok u3)");
cancel("RANDOM cannot cancel", RANDOM, 3, "(err u327)");
cancel("cancel with liar NFT -> wrong nft", SELLER, 3, "(err u308)", LIAR);
cancel("seller cancels #3", SELLER, 3, "(ok true)");
evalc("#1654 back to seller", owner(1654));
cancel("cancel twice", SELLER, 3, "(err u322)");

// ---- pause / unregister: bids blocked, settle still works so escrow never sticks ----
create("seller auctions #901 reserve 5, 36 -> #4", SELLER, 901, 5, 36, "(ok u4)");
bid("B1 5", B1, 4, 5, "(ok true)");
reg("admin disables bitcoin-pepe", ADMIN, "set-collection", [nft, boolCV(false), uintCV(250), principalCV(ROYALTY)], "(ok true)");
bid("no bids on a disabled collection", B2, 4, 6, "(err u302)");
reg("admin re-enables bitcoin-pepe", ADMIN, "set-collection", [nft, boolCV(true), uintCV(250), principalCV(ROYALTY)], "(ok true)");
reg("admin pauses registry", ADMIN, "set-paused", [boolCV(true)], "(ok true)");
bid("no bids while paused", B2, 4, 6, "(err u301)");
create("no new auctions while paused", SELLER, 1654, 5, 144, "(err u301)");
reg("admin unregisters auctions market", ADMIN, "set-market", [principalCV(CID), boolCV(false)], "(ok true)");
advance(36);
settle("settle works while paused + unregistered", B2, 4, "(ok true)");
evalc("#901 -> B1", owner(901));
reg("admin unpauses registry", ADMIN, "set-paused", [boolCV(false)], "(ok true)");
reg("admin re-registers market", ADMIN, "set-market", [principalCV(CID), boolCV(true)], "(ok true)");

// ---- admin ----
call("random cannot set increment", RANDOM, "set-min-increment", [uintCV(500), uintCV(STX(2))], "(err u300)");
call("bps above cap", ADMIN, "set-min-increment", [uintCV(1001), uintCV(STX(2))], "(err u313)");
call("admin sets 5% / 2 STX", ADMIN, "set-min-increment", [uintCV(500), uintCV(STX(2))], "(ok true)");
evalc("min-increment", "(get-min-increment)");
evalc("last auction id 4", "(get-last-auction-id)");

for (const [k, w] of [["S1", SELLER], ["A1", B1], ["Z1", B2], ["R1", ROYALTY], ["P1", PLATFORM], ["C6", CID]]) evalc(`${k} balance final`, stxBal(w), k);

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
const between = (x, lo, hi) => x > lo && x <= hi;
// sales: #964 at 22 (B2), #901 at 5 (B1) -> 27 STX gross, 2.5% + 2.5%
const checks = [
  ["escrow C1 = 10", d("C1", "C0"), BigInt(STX(10))],
  ["escrow C2 = 12", d("C2", "C0"), BigInt(STX(12))],
  ["escrow C3 = 20", d("C3", "C0"), BigInt(STX(20))],
  ["escrow C4 = 21", d("C4", "C0"), BigInt(STX(21))],
  ["escrow C5 = 0", d("C5", "C0"), 0n],
  ["contract holds nothing at end", d("C6", "C0"), 0n],
  ["snipe 1 extended ends-at by 6 blocks past old end - 5", u(cap.E1) - u(cap.E0), 1n],
  ["snipe 2 extended again by 3", u(cap.E2) - u(cap.E1), 3n],
  ["seller +25.65 STX minus tx fees", between(d("S1", "S0"), BigInt(STX(25)), BigInt(STX(25.65))), true],
  ["B2 -22 STX minus tx fees", between(d("Z1", "Z0"), BigInt(STX(-23)), BigInt(STX(-22))), true],
  ["B1 -5 STX minus tx fees", between(d("A1", "A0"), BigInt(STX(-6)), BigInt(STX(-5))), true],
  ["royalty +0.675", d("R1", "R0"), BigInt(STX(0.675))],
  ["platform +0.675", d("P1", "P0"), BigInt(STX(0.675))],
];
for (const [label, got, want] of checks) { const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (want ${want})`); ok ? pass++ : fail++; }
console.log(`\n=== ${pass} passed, ${fail} failed ===\n${url}`);
if (fail > 0) process.exit(1);
