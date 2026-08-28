// collection-bids-test.js
// Self-verifying stxer harness for fakfun-collection-bids: deploys from
// chavita at mainnet tip, then walks bids in sBTC and PEPE on Bitcoin Pepe
// through place / fill / re-price / cancel / pause / admin handover, and
// asserts every decoded result plus the sBTC balance deltas.
//
//   node simulations/collection-bids-test.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, principalCV, contractPrincipalCV, boolCV,
  deserializeCV, cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";   // chavita = fakfun var
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";  // owns Bitcoin Pepe 137/139/178
const BIDDER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";  // 47,035 sats + 421M PEPE
const RANDOM = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";  // attacker / new admin / royalty recipient
const PLATFORM = "SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE";

const NAME = "fakfun-collection-bids";
const CID = `${ADMIN}.${NAME}`;
const BPEPE = ["SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ", "bitcoin-pepe"];
const SBTC = ["SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"];
const PEPE = ["SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275", "tokensoft-token-v4k68639zxz"];
const NOT_WL = ["SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT", "notastrategy"];
const OTHER_NFT = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.sbtc-fakfun-amm-lp-v1"; // not whitelisted
const cp = ([a, n]) => contractPrincipalCV(a, n);

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
function call(label, sender, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, capture) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, capture });
}
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 });
  plan.push({ kind: "advance", label: `advance ${n} burn blocks` });
}
const sbtcBal = (who) => `(contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance '${who})`;
const owner = (id) => `(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-owner u${id})`;

// ---- deploy ----
b.withSender(ADMIN).addContractDeploy({
  contract_name: NAME,
  source_code: fs.readFileSync("./contracts/fakfun-collection-bids.clar", "utf8"),
  clarity_version: ClarityVersion.Clarity4,
});
plan.push({ kind: "deploy", label: "deploy fakfun-collection-bids" });

// ---- admin ----
call("random cannot whitelist collection", RANDOM, "set-collection",
  [principalCV(BPEPE.join(".")), boolCV(true), uintCV(250), principalCV(RANDOM)], "(err u300)");
call("admin whitelists bitcoin-pepe, royalty 2.5% -> RANDOM", ADMIN, "set-collection",
  [principalCV(BPEPE.join(".")), boolCV(true), uintCV(250), principalCV(RANDOM)], "(ok true)");
call("royalty above cap rejected", ADMIN, "set-collection",
  [principalCV(BPEPE.join(".")), boolCV(true), uintCV(1001), principalCV(RANDOM)], "(err u313)");
evalc("sBTC whitelisted at deploy", `(is-ft-whitelisted '${SBTC.join(".")})`);
evalc("PEPE whitelisted at deploy", `(is-ft-whitelisted '${PEPE.join(".")})`);

// ---- balances before ----
evalc("seller sBTC before", sbtcBal(SELLER), "S0");
evalc("royalty recipient sBTC before", sbtcBal(RANDOM), "R0");
evalc("platform sBTC before", sbtcBal(PLATFORM), "P0");
evalc("bidder sBTC before", sbtcBal(BIDDER), "B0");

// ---- place ----
call("bidder: 10,000 sats x2 on any Bitcoin Pepe", BIDDER, "place-bid",
  [principalCV(BPEPE.join(".")), cp(SBTC), uintCV(10000), uintCV(2)], "(ok u1)");
call("bidder: 10M PEPE x1 on any Bitcoin Pepe", BIDDER, "place-bid",
  [principalCV(BPEPE.join(".")), cp(PEPE), uintCV(10_000_000_000), uintCV(1)], "(ok u2)");
call("non-whitelisted FT rejected", BIDDER, "place-bid",
  [principalCV(BPEPE.join(".")), cp(NOT_WL), uintCV(1000), uintCV(1)], "(err u303)");
call("non-whitelisted collection rejected", BIDDER, "place-bid",
  [principalCV(OTHER_NFT), cp(SBTC), uintCV(1000), uintCV(1)], "(err u302)");
call("zero price rejected", BIDDER, "place-bid",
  [principalCV(BPEPE.join(".")), cp(SBTC), uintCV(0), uintCV(1)], "(err u304)");
call("quantity above cap rejected", BIDDER, "place-bid",
  [principalCV(BPEPE.join(".")), cp(SBTC), uintCV(1), uintCV(101)], "(err u305)");
evalc("escrow held by contract after 2 bids (20,000 sats)", sbtcBal(CID), "E1");
evalc("quote-fill bid 1", "(quote-fill u1)");

// ---- fill ----
call("bidder cannot fill own bid", BIDDER, "accept-bid", [uintCV(1), uintCV(137), cp(BPEPE), cp(SBTC)], "(err u311)");
call("random does not own #139: the NFT contract rejects the transfer", RANDOM, "accept-bid", [uintCV(1), uintCV(139), cp(BPEPE), cp(SBTC)], "(err u1)");
call("wrong FT for bid 1", SELLER, "accept-bid", [uintCV(1), uintCV(137), cp(BPEPE), cp(PEPE)], "(err u309)");
call("wrong NFT contract for bid 1", SELLER, "accept-bid", [uintCV(1), uintCV(137), cp(["SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS", "sbtc-fakfun-amm-lp-v1"]), cp(SBTC)], "(err u308)");
call("seller fills bid 1 with #137", SELLER, "accept-bid", [uintCV(1), uintCV(137), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("#137 owner is now bidder", owner(137));
evalc("bid 1 remaining 1", "(get-bid u1)");
evalc("seller sBTC after fill 1", sbtcBal(SELLER), "S1");

// ---- re-price ----
call("random cannot re-price", RANDOM, "update-bid-price", [uintCV(1), cp(SBTC), uintCV(12000)], "(err u307)");
call("same price rejected", BIDDER, "update-bid-price", [uintCV(1), cp(SBTC), uintCV(10000)], "(err u304)");
call("bidder raises bid 1 to 12,000 (tops up 2,000)", BIDDER, "update-bid-price", [uintCV(1), cp(SBTC), uintCV(12000)], "(ok true)");
evalc("escrow after raise = 12,000 + PEPE bid (sBTC part)", sbtcBal(CID), "E2");
call("bidder lowers bid 1 to 8,000 (refund 4,000)", BIDDER, "update-bid-price", [uintCV(1), cp(SBTC), uintCV(8000)], "(ok true)");
evalc("escrow after lower = 8,000", sbtcBal(CID), "E3");
call("seller fills bid 1 with #139 at 8,000", SELLER, "accept-bid", [uintCV(1), uintCV(139), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("bid 1 gone", "(get-bid u1)");
call("bid 1 cannot be filled again", SELLER, "accept-bid", [uintCV(1), uintCV(178), cp(BPEPE), cp(SBTC)], "(err u306)");
evalc("sBTC escrow drained to 0", sbtcBal(CID), "E4");

// ---- PEPE fill ----
call("seller fills PEPE bid 2 with #178", SELLER, "accept-bid", [uintCV(2), uintCV(178), cp(BPEPE), cp(PEPE)], "(ok true)");
evalc("#178 owner is now bidder", owner(178));

// ---- cancel ----
call("bidder: 5,000 sats x1", BIDDER, "place-bid", [principalCV(BPEPE.join(".")), cp(SBTC), uintCV(5000), uintCV(1)], "(ok u3)");
call("random cannot cancel bid 3", RANDOM, "cancel-bid", [uintCV(3), cp(SBTC)], "(err u307)");
call("cancel with wrong FT", BIDDER, "cancel-bid", [uintCV(3), cp(PEPE)], "(err u309)");
call("bidder cancels bid 3", BIDDER, "cancel-bid", [uintCV(3), cp(SBTC)], "(ok u5000)");
evalc("bid 3 gone", "(get-bid u3)");

// ---- pause ----
call("bidder: 6,000 sats x1", BIDDER, "place-bid", [principalCV(BPEPE.join(".")), cp(SBTC), uintCV(6000), uintCV(1)], "(ok u4)");
call("admin pauses", ADMIN, "set-paused", [boolCV(true)], "(ok true)");
call("no new bids while paused", BIDDER, "place-bid", [principalCV(BPEPE.join(".")), cp(SBTC), uintCV(1000), uintCV(1)], "(err u301)");
call("no fills while paused", SELLER, "accept-bid", [uintCV(4), uintCV(267), cp(BPEPE), cp(SBTC)], "(err u301)");
call("no re-price while paused", BIDDER, "update-bid-price", [uintCV(4), cp(SBTC), uintCV(7000)], "(err u301)");
call("cancel still works while paused", BIDDER, "cancel-bid", [uintCV(4), cp(SBTC)], "(ok u6000)");
call("admin unpauses", ADMIN, "set-paused", [boolCV(false)], "(ok true)");

// ---- admin handover with cooldown ----
call("random cannot propose", RANDOM, "propose-fakfun", [principalCV(RANDOM)], "(err u300)");
call("cannot propose current admin", ADMIN, "propose-fakfun", [principalCV(ADMIN)], "(err u314)");
call("admin proposes RANDOM", ADMIN, "propose-fakfun", [principalCV(RANDOM)], "(ok true)");
call("seller (not proposed) cannot accept", SELLER, "accept-fakfun", [], "(err u300)");
call("proposed cannot accept before cooldown", RANDOM, "accept-fakfun", [], "(err u316)");
advance(143);
call("still one block short", RANDOM, "accept-fakfun", [], "(err u316)");
advance(1);
call("proposed accepts after 144 blocks", RANDOM, "accept-fakfun", [], "(ok true)");
evalc("fakfun is RANDOM now", "(get-fakfun)");
call("old admin lost control", ADMIN, "set-paused", [boolCV(true)], "(err u300)");
call("new admin has control", RANDOM, "set-paused", [boolCV(false)], "(ok true)");
call("no proposal pending -> accept fails", RANDOM, "accept-fakfun", [], "(err u315)");

// ---- final balances ----
evalc("seller sBTC final", sbtcBal(SELLER), "S2");
evalc("royalty recipient sBTC final", sbtcBal(RANDOM), "R2");
evalc("platform sBTC final", sbtcBal(PLATFORM), "P2");
evalc("bidder sBTC final", sbtcBal(BIDDER), "B2");
evalc("contract sBTC final (0)", sbtcBal(CID), "E5");

// ---- run + verify ----
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return { ok: false, str: "<no transaction result>" };
  if ("Err" in r) return { ok: false, str: `ENGINE-ERR: ${r.Err}` };
  try { return { ok: true, str: cvToString(deserializeCV(r.Ok.result)) }; }
  catch (e) { return { ok: false, str: `decode-failed: ${e.message}` }; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${r.Err}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}
const u = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {}; let pass = 0, fail = 0;
  res.steps.forEach((s, i) => {
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s).str}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const d = decodeTx(s); const ok = d.str === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s); if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else console.log(`⏩ [${i}] ${p.label}`);
  });

  console.log("\n--- sBTC delta checks ---");
  // fills: #137 at 10,000 and #139 at 8,000 -> price 18,000; 2.5% royalty + 2.5% platform each
  const checks = [
    ["escrow after 2 bids", u(cap.E1), 20000n],
    ["escrow after raise (12,000)", u(cap.E2), 12000n],
    ["escrow after lower (8,000)", u(cap.E3), 8000n],
    ["escrow after bid 1 closed", u(cap.E4), 0n],
    ["contract sBTC at end", u(cap.E5), 0n],
    ["seller net (9,500 + 7,600)", u(cap.S2) - u(cap.S0), 17100n],
    ["royalty recipient (+250 +200)", u(cap.R2) - u(cap.R0), 450n],
    ["platform (+250 +200)", u(cap.P2) - u(cap.P0), 450n],
    ["bidder paid 18,000 net of refunds", u(cap.B0) - u(cap.B2), 18000n],
  ];
  for (const [label, got, want] of checks) {
    const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (want ${want})`); ok ? pass++ : fail++;
  }
  console.log(`\n=== ${pass} passed, ${fail} failed ===\n${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
