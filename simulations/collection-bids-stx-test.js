// collection-bids-stx-test.js
// stxer harness against the DEPLOYED native-STX bids contract
// (SPV9K21….fakfun-collection-bids-stx) at mainnet tip: set-collections
// batch, STX escrow / fill / re-price / cancel / pause / handover, own-fill
// refusal, uSTX balance deltas. Bid ids are derived from the live
// get-last-bid-id so the harness keeps working as real bids land.
//   node simulations/collection-bids-stx-test.js
import { uintCV, principalCV, contractPrincipalCV, boolCV, listCV, tupleCV, deserializeCV, cvToString, cvToHex, hexToCV, cvToJSON } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const NODE = "http://77.42.3.101/stacks-api";
const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";  // Bitcoin Pepe 964/967/1654 (unlisted on Gamma)
const BIDDER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";  // ~2,300 STX liquid
const RANDOM = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const ROYALTY = "SM2J5VCY4DCFX6VZYDANHMXA3VN9DMWYCEK7Y8D93";
const PLATFORM = "SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE";
const NAME = "fakfun-collection-bids-stx";
const CID = `${ADMIN}.${NAME}`;
const BPEPE = ["SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ", "bitcoin-pepe"];
const cp = ([a, n]) => contractPrincipalCV(a, n);
const nft = principalCV(BPEPE.join("."));
const STX = (n) => n * 1_000_000;

// live last-bid-id -> ids this run will create
const r = await fetch(`${NODE}/v2/contracts/call-read/${ADMIN}/${NAME}/get-last-bid-id?tip=latest`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sender: ADMIN, arguments: [] }),
}).then((x) => x.json());
const LAST = Number(cvToJSON(hexToCV(r.result)).value);
const B1 = LAST + 1, B2 = LAST + 2, B3 = LAST + 3;
console.log(`live last-bid-id = ${LAST}; this run uses ${B1}..${B3}`);

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
const call = (label, sender, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const evalc = (label, code, capture) => { b.addEvalCode(CID, code); plan.push({ kind: "eval", label, capture }); };
const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
const stxBal = (who) => `(stx-get-balance '${who})`;
const owner = (id) => `(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-owner u${id})`;

evalc("fakfun admin is chavita", "(get-fakfun)");

// ---- set-collections batch ----
const entries = listCV([
  tupleCV({ "nft-contract": nft, "royalty-bps": uintCV(250), "royalty-recipient": principalCV(ROYALTY) }),
  tupleCV({ "nft-contract": principalCV(`${ADMIN}.froggy-gamma-nft`), "royalty-bps": uintCV(250), "royalty-recipient": principalCV(ADMIN) }),
]);
call("random cannot set-collections", RANDOM, "set-collections", [entries], "(err u300)");
call("empty list rejected", ADMIN, "set-collections", [listCV([])], "(err u317)");
call("royalty above cap rejected in batch", ADMIN, "set-collections", [listCV([tupleCV({ "nft-contract": nft, "royalty-bps": uintCV(1001), "royalty-recipient": principalCV(ROYALTY) })])], "(err u313)");
call("admin set-collections x2", ADMIN, "set-collections", [entries], "(ok u2)");
evalc("bitcoin-pepe terms", `(get-collection '${BPEPE.join(".")})`);

// ---- balances before ----
evalc("seller STX 0", stxBal(SELLER), "S0");
evalc("bidder STX 0", stxBal(BIDDER), "B0");
evalc("royalty STX 0", stxBal(ROYALTY), "R0");
evalc("platform STX 0", stxBal(PLATFORM), "P0");
evalc("contract STX 0", stxBal(CID), "C0");

// ---- place ----
call(`bidder: 50 STX x2 -> bid ${B1}`, BIDDER, "place-bid", [nft, uintCV(STX(50)), uintCV(2)], `(ok u${B1})`);
evalc("contract STX = +100", stxBal(CID), "C1");
call("zero price", BIDDER, "place-bid", [nft, uintCV(0), uintCV(1)], "(err u304)");
call("qty 101", BIDDER, "place-bid", [nft, uintCV(1), uintCV(101)], "(err u305)");
call("unknown collection", BIDDER, "place-bid", [principalCV("SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.sbtc-fakfun-amm-lp-v1"), uintCV(STX(1)), uintCV(1)], "(err u302)");
call("more STX than bidder has", BIDDER, "place-bid", [nft, uintCV(STX(5000)), uintCV(1)], "(err u1)");

// ---- fill ----
evalc(`quote-fill ${B1} (48.75 STX net)`, `(quote-fill u${B1})`);
call("bidder cannot fill own", BIDDER, "accept-bid", [uintCV(B1), uintCV(964), cp(BPEPE)], "(err u311)");
call("random does not own #964 -> NFT contract refuses", RANDOM, "accept-bid", [uintCV(B1), uintCV(964), cp(BPEPE)], "(err u1)");
call("wrong NFT contract", SELLER, "accept-bid", [uintCV(B1), uintCV(964), cp(["SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS", "sbtc-fakfun-amm-lp-v1"])], "(err u308)");
call("seller fills with #964", SELLER, "accept-bid", [uintCV(B1), uintCV(964), cp(BPEPE)], "(ok true)");
evalc("#964 -> bidder", owner(964));
evalc(`bid ${B1} remaining 1`, `(get-bid u${B1})`);
evalc("seller STX 1", stxBal(SELLER), "S1");

// ---- re-price ----
call("random cannot re-price", RANDOM, "update-bid-price", [uintCV(B1), uintCV(STX(60))], "(err u307)");
call("same price", BIDDER, "update-bid-price", [uintCV(B1), uintCV(STX(50))], "(err u304)");
call("raise to 60 STX (+10)", BIDDER, "update-bid-price", [uintCV(B1), uintCV(STX(60))], "(ok true)");
evalc("contract STX = 60", stxBal(CID), "C2");
call("lower to 40 STX (-20)", BIDDER, "update-bid-price", [uintCV(B1), uintCV(STX(40))], "(ok true)");
evalc("contract STX = 40", stxBal(CID), "C3");
call("seller fills with #967 at 40", SELLER, "accept-bid", [uintCV(B1), uintCV(967), cp(BPEPE)], "(ok true)");
evalc(`bid ${B1} gone`, `(get-bid u${B1})`);
call("cannot fill again", SELLER, "accept-bid", [uintCV(B1), uintCV(1654), cp(BPEPE)], "(err u306)");
evalc("contract STX = 0", stxBal(CID), "C4");

// ---- cancel ----
call(`bidder: 5 STX x1 -> bid ${B2}`, BIDDER, "place-bid", [nft, uintCV(STX(5)), uintCV(1)], `(ok u${B2})`);
call("random cannot cancel", RANDOM, "cancel-bid", [uintCV(B2)], "(err u307)");
call("bidder cancels", BIDDER, "cancel-bid", [uintCV(B2)], `(ok u${STX(5)})`);
call("cancel again", BIDDER, "cancel-bid", [uintCV(B2)], "(err u306)");

// ---- pause ----
call(`bidder: 6 STX x1 -> bid ${B3}`, BIDDER, "place-bid", [nft, uintCV(STX(6)), uintCV(1)], `(ok u${B3})`);
call("admin pauses", ADMIN, "set-paused", [boolCV(true)], "(ok true)");
call("no bids while paused", BIDDER, "place-bid", [nft, uintCV(STX(1)), uintCV(1)], "(err u301)");
call("no fills while paused", SELLER, "accept-bid", [uintCV(B3), uintCV(1654), cp(BPEPE)], "(err u301)");
call("cancel works while paused", BIDDER, "cancel-bid", [uintCV(B3)], `(ok u${STX(6)})`);
call("admin unpauses", ADMIN, "set-paused", [boolCV(false)], "(ok true)");

// ---- handover ----
call("random cannot propose", RANDOM, "propose-fakfun", [principalCV(RANDOM)], "(err u300)");
call("admin proposes RANDOM", ADMIN, "propose-fakfun", [principalCV(RANDOM)], "(ok true)");
call("too early", RANDOM, "accept-fakfun", [], "(err u316)");
advance(144);
call("accepts after 144", RANDOM, "accept-fakfun", [], "(ok true)");
call("old admin locked out", ADMIN, "set-paused", [boolCV(true)], "(err u300)");

evalc("seller STX final", stxBal(SELLER), "S2");
evalc("bidder STX final", stxBal(BIDDER), "B2");
evalc("royalty STX final", stxBal(ROYALTY), "R2");
evalc("platform STX final", stxBal(PLATFORM), "P2");
evalc("contract STX final", stxBal(CID), "C5");

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
// fills: #964 at 50 STX, #967 at 40 STX -> 90 STX; 2.5% royalty + 2.5% platform each
const checks = [
  ["escrow after bid", u(cap.C1) - u(cap.C0), BigInt(STX(100))],
  ["escrow after raise", u(cap.C2) - u(cap.C0), BigInt(STX(60))],
  ["escrow after lower", u(cap.C3) - u(cap.C0), BigInt(STX(40))],
  ["escrow after close", u(cap.C4) - u(cap.C0), 0n],
  ["contract STX unchanged at end", u(cap.C5) - u(cap.C0), 0n],
  ["seller net 85.5 STX (fees) minus tx fees", (u(cap.S2) - u(cap.S0)) > BigInt(STX(85)) && (u(cap.S2) - u(cap.S0)) <= BigInt(STX(85.5)), true],
  ["royalty +2.25 STX", u(cap.R2) - u(cap.R0), BigInt(STX(2.25))],
  ["platform +2.25 STX", u(cap.P2) - u(cap.P0), BigInt(STX(2.25))],
];
for (const [label, got, want] of checks) { const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (want ${want})`); ok ? pass++ : fail++; }
console.log(`\n=== ${pass} passed, ${fail} failed ===\n${url}`);
if (fail > 0) process.exit(1);
