// collection-bids-edge-cases.js
// Second stxer harness for fakfun-collection-bids: every branch the happy
// path harness (collection-bids-test.js) does not reach. Fee and royalty
// changes and their zero branches, a collection disabled and an FT de-listed
// while bids are open, proposal cancel / overwrite, PEPE-side re-price and
// cancel, insufficient funds, max quantity, fees that round to zero, and the
// not-found paths.
//
//   node simulations/collection-bids-edge-cases.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, principalCV, contractPrincipalCV, boolCV,
  deserializeCV, cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";  // Bitcoin Pepe 267/274/340/901/1654 (334/546 are Gamma-listed)
const OPERATOR = "SP1JAG6TV2XRYFGJN7CAAN6Z3CEW2YMZWMHJAJV91"; // has #1499 escrowed on our pepe-nft-marketplace
const OUR_MARKET = `${ADMIN}.pepe-nft-marketplace`;
const BIDDER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";  // 47,035 sats, 421M PEPE
const RANDOM = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const ROYALTY = "SP3TA7SMY7APYR9SFKDT0527NC0GWR84S3AHEM0NE";
const PLATFORM2 = "SP3A4CP63QJB1R0EJR3TJ1PN16FC5HVJSPT77C8C0";

const NAME = "fakfun-collection-bids";
const CID = `${ADMIN}.${NAME}`;
const BPEPE = ["SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ", "bitcoin-pepe"];
const SBTC = ["SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"];
const PEPE = ["SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275", "tokensoft-token-v4k68639zxz"];
const cp = ([a, n]) => contractPrincipalCV(a, n);
const nft = principalCV(BPEPE.join("."));

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
const call = (label, sender, fn, args, expect) => {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
};
const callOn = (label, sender, cid, fn, args, expect) => {
  b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
};
const evalc = (label, code, capture) => { b.addEvalCode(CID, code); plan.push({ kind: "eval", label, capture }); };
const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
const sbtcBal = (who) => `(contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance '${who})`;
const pepeBal = (who) => `(contract-call? 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz get-balance '${who})`;
const owner = (id) => `(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-owner u${id})`;

b.withSender(ADMIN).addContractDeploy({
  contract_name: NAME,
  source_code: fs.readFileSync("./contracts/fakfun-collection-bids.clar", "utf8"),
  clarity_version: ClarityVersion.Clarity4,
});
plan.push({ kind: "deploy", label: "deploy" });

// ---- reads on an empty contract ----
evalc("get-last-bid-id = u0", "(get-last-bid-id)");
evalc("get-bid u1 = none", "(get-bid u1)");
evalc("quote-fill u1 = none", "(quote-fill u1)");
evalc("get-collection unknown = none", `(get-collection '${BPEPE.join(".")})`);
evalc("get-pending-fakfun = none", "(get-pending-fakfun)");
evalc("is-paused = false", "(is-paused)");
evalc("platform fee = u250", "(get-platform-fee-bps)");
call("cancel unknown bid", BIDDER, "cancel-bid", [uintCV(1), cp(SBTC)], "(err u306)");
call("re-price unknown bid", BIDDER, "update-bid-price", [uintCV(1), cp(SBTC), uintCV(1)], "(err u306)");
call("fill unknown bid", SELLER, "accept-bid", [uintCV(1), uintCV(267), cp(BPEPE), cp(SBTC)], "(err u306)");

// ---- fee admin ----
call("random cannot set platform fee", RANDOM, "set-platform-fee", [uintCV(100)], "(err u300)");
call("platform fee above 5% rejected", ADMIN, "set-platform-fee", [uintCV(501)], "(err u313)");
call("platform fee to 5%", ADMIN, "set-platform-fee", [uintCV(500)], "(ok true)");
call("random cannot set platform recipient", RANDOM, "set-platform-recipient", [principalCV(RANDOM)], "(err u300)");
call("platform recipient -> PLATFORM2", ADMIN, "set-platform-recipient", [principalCV(PLATFORM2)], "(ok true)");
call("random cannot whitelist FT", RANDOM, "whitelist-ft", [cp(SBTC), boolCV(false)], "(err u300)");
call("random cannot pause", RANDOM, "set-paused", [boolCV(true)], "(err u300)");
call("collection with 10% royalty (cap)", ADMIN, "set-collection", [nft, boolCV(true), uintCV(1000), principalCV(ROYALTY)], "(ok true)");
evalc("get-collection", `(get-collection '${BPEPE.join(".")})`);

// ---- fill at 10% royalty + 5% platform, PEPE side re-price + cancel ----
evalc("seller sBTC 0", sbtcBal(SELLER), "S0");
evalc("royalty sBTC 0", sbtcBal(ROYALTY), "R0");
evalc("platform2 sBTC 0", sbtcBal(PLATFORM2), "P0");
evalc("bidder PEPE 0", pepeBal(BIDDER), "BP0");
evalc("seller PEPE 0", pepeBal(SELLER), "SP0");
call("bid 1: 10,000 sats x1", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(10000), uintCV(1)], "(ok u1)");
evalc("quote-fill 1 (8,500 net)", "(quote-fill u1)");
call("fill bid 1 with #267", SELLER, "accept-bid", [uintCV(1), uintCV(267), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("#267 -> bidder", owner(267));
evalc("seller sBTC 1", sbtcBal(SELLER), "S1");
evalc("royalty sBTC 1", sbtcBal(ROYALTY), "R1");
evalc("platform2 sBTC 1", sbtcBal(PLATFORM2), "P1");

call("bid 2: 1M PEPE x2", BIDDER, "place-bid", [nft, cp(PEPE), uintCV(1_000_000_000), uintCV(2)], "(ok u2)");
evalc("contract PEPE = 2M", pepeBal(CID), "CP1");
call("PEPE re-price up to 1.5M", BIDDER, "update-bid-price", [uintCV(2), cp(PEPE), uintCV(1_500_000_000)], "(ok true)");
evalc("contract PEPE = 3M", pepeBal(CID), "CP2");
call("PEPE re-price zero rejected", BIDDER, "update-bid-price", [uintCV(2), cp(PEPE), uintCV(0)], "(err u304)");
call("PEPE re-price wrong FT", BIDDER, "update-bid-price", [uintCV(2), cp(SBTC), uintCV(1)], "(err u309)");
call("fill bid 2 with #274 (1 of 2)", SELLER, "accept-bid", [uintCV(2), uintCV(274), cp(BPEPE), cp(PEPE)], "(ok true)");
evalc("bid 2 remaining 1 at 1.5M", "(get-bid u2)");
call("PEPE re-price down to 1.2M (refund 300k)", BIDDER, "update-bid-price", [uintCV(2), cp(PEPE), uintCV(1_200_000_000)], "(ok true)");
evalc("contract PEPE = 1.2M", pepeBal(CID), "CP3");
call("PEPE cancel bid 2", BIDDER, "cancel-bid", [uintCV(2), cp(PEPE)], "(ok u1200000000)");
evalc("contract PEPE = 0", pepeBal(CID), "CP4");
evalc("bidder PEPE 1", pepeBal(BIDDER), "BP1");
evalc("seller PEPE 1", pepeBal(SELLER), "SP1");

// ---- zero fee branches ----
call("platform fee to 0", ADMIN, "set-platform-fee", [uintCV(0)], "(ok true)");
call("royalty to 0", ADMIN, "set-collection", [nft, boolCV(true), uintCV(0), principalCV(ROYALTY)], "(ok true)");
call("bid 3: 1,000 sats x1", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(1000), uintCV(1)], "(ok u3)");
evalc("quote-fill 3 (1,000 net, no fees)", "(quote-fill u3)");
call("fill bid 3 with #901 (no fee transfers)", SELLER, "accept-bid", [uintCV(3), uintCV(901), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("seller sBTC 2", sbtcBal(SELLER), "S2");
// fees that round to zero: 2.5% of 39 sats = 0
call("platform fee back to 2.5%", ADMIN, "set-platform-fee", [uintCV(250)], "(ok true)");
call("royalty back to 2.5%", ADMIN, "set-collection", [nft, boolCV(true), uintCV(250), principalCV(ROYALTY)], "(ok true)");
call("bid 4: 39 sats x1 (fees round to 0)", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(39), uintCV(1)], "(ok u4)");
evalc("quote-fill 4", "(quote-fill u4)");
call("fill bid 4 with #1654", SELLER, "accept-bid", [uintCV(4), uintCV(1654), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("seller sBTC 3", sbtcBal(SELLER), "S3");

// ---- insufficient funds / max quantity ----
call("bid above bidder balance fails in token", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(100000), uintCV(1)], "(err u1)");
call("quantity 100 accepted (1 sat each)", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(1), uintCV(100)], "(ok u5)");
evalc("contract sBTC = 100", sbtcBal(CID), "E100");
call("cancel bid 5", BIDDER, "cancel-bid", [uintCV(5), cp(SBTC)], "(ok u100)");

// ---- collection disabled with an open bid ----
call("bid 6: 2,000 sats x1", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(2000), uintCV(1)], "(ok u6)");
call("admin disables bitcoin-pepe", ADMIN, "set-collection", [nft, boolCV(false), uintCV(250), principalCV(ROYALTY)], "(ok true)");
evalc("is-collection-enabled = false", `(is-collection-enabled '${BPEPE.join(".")})`);
call("no new bids on disabled collection", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(1000), uintCV(1)], "(err u302)");
call("no fills on disabled collection", SELLER, "accept-bid", [uintCV(6), uintCV(340), cp(BPEPE), cp(SBTC)], "(err u302)");
call("no re-price on disabled collection", BIDDER, "update-bid-price", [uintCV(6), cp(SBTC), uintCV(2500)], "(err u302)");
call("cancel still refunds", BIDDER, "cancel-bid", [uintCV(6), cp(SBTC)], "(ok u2000)");
call("admin re-enables", ADMIN, "set-collection", [nft, boolCV(true), uintCV(250), principalCV(ROYALTY)], "(ok true)");

// ---- FT de-listed with an open bid ----
call("bid 7: 3,000 sats x1", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(3000), uintCV(1)], "(ok u7)");
call("admin de-lists sBTC", ADMIN, "whitelist-ft", [cp(SBTC), boolCV(false)], "(ok true)");
evalc("sBTC whitelisted = false", `(is-ft-whitelisted '${SBTC.join(".")})`);
call("no new sBTC bids", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(1000), uintCV(1)], "(err u303)");
call("no re-price (would take new escrow)", BIDDER, "update-bid-price", [uintCV(7), cp(SBTC), uintCV(3500)], "(err u303)");
call("existing bid still fillable", SELLER, "accept-bid", [uintCV(7), uintCV(340), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("#340 -> bidder", owner(340));
call("bid 8 in PEPE still fine", BIDDER, "place-bid", [nft, cp(PEPE), uintCV(1000), uintCV(1)], "(ok u8)");
call("cancel bid 8", BIDDER, "cancel-bid", [uintCV(8), cp(PEPE)], "(ok u1000)");
call("admin re-lists sBTC", ADMIN, "whitelist-ft", [cp(SBTC), boolCV(true)], "(ok true)");

// ---- NFTs that cannot move: Gamma-listed, or escrowed on our own market ----
call("bid 9: 1,000 sats x2", BIDDER, "place-bid", [nft, cp(SBTC), uintCV(1000), uintCV(2)], "(ok u9)");
evalc("#334 is listed on Gamma", "(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-listing-in-ustx u334)");
call("Gamma-listed #334 cannot fill: NFT contract refuses transfer (its u106)", SELLER, "accept-bid", [uintCV(9), uintCV(334), cp(BPEPE), cp(SBTC)], "(err u106)");
evalc("bid 9 untouched after the revert", "(get-bid u9)");
evalc("#1499 is held by our pepe-nft-marketplace", owner(1499));
call("escrowed #1499: our market owns it, NFT contract rejects the transfer", OPERATOR, "accept-bid", [uintCV(9), uintCV(1499), cp(BPEPE), cp(SBTC)], "(err u1)");
callOn("operator unlists #1499 from pepe-nft-marketplace", OPERATOR, OUR_MARKET, "unlist-nft", [uintCV(1499), cp(BPEPE)], "(ok true)");
evalc("#1499 back with operator", owner(1499));
call("now #1499 fills bid 9", OPERATOR, "accept-bid", [uintCV(9), uintCV(1499), cp(BPEPE), cp(SBTC)], "(ok true)");
evalc("#1499 -> bidder", owner(1499));
call("bidder cancels the rest of bid 9", BIDDER, "cancel-bid", [uintCV(9), cp(SBTC)], "(ok u1000)");

// ---- whitelist trust boundary: a lying NFT contract (documented, not guarded) ----
// The contract no longer re-reads get-owner after transfer. A whitelisted NFT
// whose transfer returns ok without moving the token therefore DOES get paid.
// This pins the trust assumption: the admin vets every collection it lists,
// exactly as it vets every FT for the with-ft "*" wildcard (see README).
const LIAR = `${RANDOM}.liar-nft`;
b.withSender(RANDOM).addContractDeploy({
  contract_name: "liar-nft",
  clarity_version: ClarityVersion.Clarity4,
  source_code: `(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(define-non-fungible-token liar uint)
(define-read-only (get-last-token-id) (ok u1))
(define-read-only (get-token-uri (id uint)) (ok none))
(define-read-only (get-owner (id uint)) (ok (nft-get-owner? liar id)))
(define-public (transfer (id uint) (sender principal) (recipient principal)) (ok true))
(define-public (mint (to principal)) (nft-mint? liar u1 to))`,
});
plan.push({ kind: "deploy", label: "deploy liar-nft (transfer is a no-op that returns ok)" });
callOn("mint liar #1 to SELLER", RANDOM, LIAR, "mint", [principalCV(SELLER)], "(ok true)");
call("admin whitelists liar-nft (the mistake the whitelist must never make)", ADMIN, "set-collection", [principalCV(LIAR), boolCV(true), uintCV(0), principalCV(ROYALTY)], "(ok true)");
evalc("seller sBTC before liar fill", sbtcBal(SELLER), "SL0");
call("bid 10: 500 sats on liar-nft", BIDDER, "place-bid", [principalCV(LIAR), cp(SBTC), uintCV(500), uintCV(1)], "(ok u10)");
call("fill with liar #1: paid although nothing moved (whitelist is the guard)", SELLER, "accept-bid", [uintCV(10), uintCV(1), cp([RANDOM, "liar-nft"]), cp(SBTC)], "(ok true)");
evalc("liar #1 still with SELLER", `(contract-call? '${LIAR} get-owner u1)`);
evalc("seller sBTC after liar fill", sbtcBal(SELLER), "SL1");
evalc("bid 10 consumed", "(get-bid u10)");
call("nothing left to cancel", BIDDER, "cancel-bid", [uintCV(10), cp(SBTC)], "(err u306)");

// ---- proposal cancel / overwrite ----
call("random cannot cancel proposal", RANDOM, "cancel-fakfun-proposal", [], "(err u300)");
call("nothing to cancel", ADMIN, "cancel-fakfun-proposal", [], "(err u315)");
call("propose RANDOM", ADMIN, "propose-fakfun", [principalCV(RANDOM)], "(ok true)");
call("overwrite with SELLER", ADMIN, "propose-fakfun", [principalCV(SELLER)], "(ok true)");
evalc("pending = SELLER", "(get-pending-fakfun)");
advance(144);
call("RANDOM (overwritten) cannot accept", RANDOM, "accept-fakfun", [], "(err u300)");
call("admin cancels proposal", ADMIN, "cancel-fakfun-proposal", [], "(ok true)");
call("SELLER cannot accept cancelled proposal", SELLER, "accept-fakfun", [], "(err u315)");
evalc("fakfun unchanged", "(get-fakfun)");
evalc("contract sBTC final 0", sbtcBal(CID), "E5");
evalc("contract PEPE final 0", pepeBal(CID), "CP5");
evalc("last bid id = u10", "(get-last-bid-id)");

// ---- run + verify ----
const dtx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<none>"; if ("Err" in r) return `ENGINE-ERR: ${r.Err}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; } };
const dev = (s) => { const r = s?.Result?.Eval; if (!r) return "<none>"; if (!("Ok" in r)) return `ERR: ${r.Err}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const u = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {}; let pass = 0, fail = 0;
  res.steps.forEach((s, i) => {
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") { const ok = !("Err" in (s?.Result?.Transaction || {})); console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${dtx(s)}`); ok ? pass++ : fail++; }
    else if (p.kind === "tx") { const got = dtx(s); const ok = got === p.expect; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
    else if (p.kind === "eval") { const v = dev(s); if (p.capture) cap[p.capture] = v; console.log(`ℹ️  [${i}] ${p.label}: ${v}`); }
    else console.log(`⏩ [${i}] ${p.label}`);
  });
  console.log("\n--- delta checks ---");
  const checks = [
    ["fill 1: seller +8,500 (10% royalty, 5% platform)", u(cap.S1) - u(cap.S0), 8500n],
    ["fill 1: royalty +1,000", u(cap.R1) - u(cap.R0), 1000n],
    ["fill 1: platform2 +500", u(cap.P1) - u(cap.P0), 500n],
    ["PEPE escrow 2M", u(cap.CP1), 2_000_000_000n],
    ["PEPE escrow 3M after raise", u(cap.CP2), 3_000_000_000n],
    ["PEPE escrow 1.2M after fill + lower", u(cap.CP3), 1_200_000_000n],
    ["PEPE escrow 0 after cancel", u(cap.CP4), 0n],
    ["seller PEPE +1.275M (1.5M less 10%+5%)", u(cap.SP1) - u(cap.SP0), 1_275_000_000n],
    ["bidder PEPE -1.5M net", u(cap.BP0) - u(cap.BP1), 1_500_000_000n],
    ["fill 3: seller +1,000 (no fees)", u(cap.S2) - u(cap.S1), 1000n],
    ["fill 4: seller +39 (fees round to 0)", u(cap.S3) - u(cap.S2), 39n],
    ["qty 100 escrow = 100", u(cap.E100), 100n],
    ["liar fill paid seller 488 (500 less 2.5% platform = 12)", u(cap.SL1) - u(cap.SL0), 488n],
    ["contract sBTC 0 at end", u(cap.E5), 0n],
    ["contract PEPE 0 at end", u(cap.CP5), 0n],
  ];
  for (const [label, got, want] of checks) { const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (want ${want})`); ok ? pass++ : fail++; }
  console.log(`\n=== ${pass} passed, ${fail} failed ===\n${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
