// collection-bids-stx-edge-cases.js
// Adversarial / edge harness against the DEPLOYED fakfun-collection-bids-stx
// at mainnet tip. Fee and royalty changes while bids are open (recipients set
// to the seller, and to the contract itself), collection disabled with open
// bids, uint overflow attempts, dust fills, partial-fill cancel and re-price
// escrow math, Gamma-listed and market-escrowed NFTs, a lying NFT, proposal
// overwrite / cancel, pause interplay. Ids derive from the live last-bid-id.
//   node simulations/collection-bids-stx-edge-cases.js
import { ClarityVersion, uintCV, principalCV, contractPrincipalCV, boolCV, listCV, tupleCV, deserializeCV, cvToString, hexToCV, cvToJSON } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const NODE = "http://77.42.3.101/stacks-api";
const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";   // owns 901, 1654 (unlisted), 1445 (Gamma-listed)
const BIDDER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";   // ~2,300 STX liquid
const RANDOM = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const OPERATOR = "SP1JAG6TV2XRYFGJN7CAAN6Z3CEW2YMZWMHJAJV91";  // #1499 escrowed on our pepe-nft-marketplace
const ROYALTY = "SM2J5VCY4DCFX6VZYDANHMXA3VN9DMWYCEK7Y8D93";
const PLATFORM = "SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE";
const PLATFORM2 = "SP3A4CP63QJB1R0EJR3TJ1PN16FC5HVJSPT77C8C0";
const NAME = "fakfun-collection-bids-stx";
const CID = `${ADMIN}.${NAME}`;
const OUR_MARKET = `${ADMIN}.pepe-nft-marketplace`;
const BPEPE = ["SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ", "bitcoin-pepe"];
const cp = ([a, n]) => contractPrincipalCV(a, n);
const nft = principalCV(BPEPE.join("."));
const STX = (n) => Math.round(n * 1_000_000);
const HUGE = (1n << 126n).toString();

const r = await fetch(`${NODE}/v2/contracts/call-read/${ADMIN}/${NAME}/get-last-bid-id?tip=latest`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sender: ADMIN, arguments: [] }),
}).then((x) => x.json());
const LAST = Number(cvToJSON(hexToCV(r.result)).value);
const id = (k) => LAST + k;
console.log(`live last-bid-id = ${LAST}`);

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
const call = (label, sender, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const callOn = (label, sender, cid, fn, args, expect) => { b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args }); plan.push({ kind: "tx", label, expect }); };
const evalc = (label, code, capture) => { b.addEvalCode(CID, code); plan.push({ kind: "eval", label, capture }); };
const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
const stxBal = (who) => `(stx-get-balance '${who})`;
const owner = (i) => `(contract-call? 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe get-owner u${i})`;
const setColl = (label, enabled, bps, rec, expect = "(ok true)") => call(label, ADMIN, "set-collection", [nft, boolCV(enabled), uintCV(bps), principalCV(rec)], expect);

// ---- unknown ids ----
call("cancel unknown", BIDDER, "cancel-bid", [uintCV(id(99))], "(err u306)");
call("re-price unknown", BIDDER, "update-bid-price", [uintCV(id(99)), uintCV(1)], "(err u306)");
call("accept unknown", SELLER, "accept-bid", [uintCV(id(99)), uintCV(1654), cp(BPEPE)], "(err u306)");
evalc("quote-fill unknown = none", `(quote-fill u${id(99)})`);

// ---- fee admin + 10% royalty / 5% platform fill ----
call("random cannot set fee", RANDOM, "set-platform-fee", [uintCV(100)], "(err u300)");
call("fee above cap", ADMIN, "set-platform-fee", [uintCV(501)], "(err u313)");
call("fee -> 5%", ADMIN, "set-platform-fee", [uintCV(500)], "(ok true)");
call("random cannot set recipient", RANDOM, "set-platform-recipient", [principalCV(RANDOM)], "(err u300)");
call("recipient -> PLATFORM2", ADMIN, "set-platform-recipient", [principalCV(PLATFORM2)], "(ok true)");
setColl("royalty -> 10% (cap) to ROYALTY", true, 1000, ROYALTY);
evalc("seller 0", stxBal(SELLER), "S0"); evalc("royalty 0", stxBal(ROYALTY), "R0"); evalc("platform2 0", stxBal(PLATFORM2), "P0"); evalc("contract 0", stxBal(CID), "C0");
call(`bid A: 10 STX x1 -> ${id(1)}`, BIDDER, "place-bid", [nft, uintCV(STX(10)), uintCV(1)], `(ok u${id(1)})`);
evalc("quote A (8.5 net)", `(quote-fill u${id(1)})`);
call("fill A with #1654", SELLER, "accept-bid", [uintCV(id(1)), uintCV(1654), cp(BPEPE)], "(ok true)");
evalc("seller 1", stxBal(SELLER), "S1"); evalc("royalty 1", stxBal(ROYALTY), "R1"); evalc("platform2 1", stxBal(PLATFORM2), "P1");

// ---- partial fill: cancel and re-price math on remaining ----
call(`bid B: 4 STX x3 -> ${id(2)}`, BIDDER, "place-bid", [nft, uintCV(STX(4)), uintCV(3)], `(ok u${id(2)})`);
evalc("contract after B (+12)", stxBal(CID), "C1");
call("fill B 1/3 with #901", SELLER, "accept-bid", [uintCV(id(2)), uintCV(901), cp(BPEPE)], "(ok true)");
evalc("contract after 1 fill (+8)", stxBal(CID), "C2");
call("B re-price up to 6 (+4 for 2 left)", BIDDER, "update-bid-price", [uintCV(id(2)), uintCV(STX(6))], "(ok true)");
evalc("contract (+12)", stxBal(CID), "C3");
call("B re-price down to 2 (-8)", BIDDER, "update-bid-price", [uintCV(id(2)), uintCV(STX(2))], "(ok true)");
evalc("contract (+4)", stxBal(CID), "C4");
call("cancel B refunds 2 x 2", BIDDER, "cancel-bid", [uintCV(id(2))], `(ok u${STX(4)})`);
evalc("contract (0)", stxBal(CID), "C5");

// ---- zero fees + dust rounding ----
call("fee -> 0", ADMIN, "set-platform-fee", [uintCV(0)], "(ok true)");
setColl("royalty -> 0", true, 0, ROYALTY);
call(`bid C: 1 STX x1 -> ${id(3)}`, BIDDER, "place-bid", [nft, uintCV(STX(1)), uintCV(1)], `(ok u${id(3)})`);
evalc("quote C (no fees)", `(quote-fill u${id(3)})`);
evalc("seller 2", stxBal(SELLER), "S2");
call("fill C with #1654 (bidder now owns it? no - seller sold it)", BIDDER, "accept-bid", [uintCV(id(3)), uintCV(1654), cp(BPEPE)], "(err u311)");
// seller sold #1654 to the bidder above; bidder holds it now. Have the bidder re-list? Instead SELLER fills with a token it still owns.
call("fill C with #1445 is Gamma-listed -> NFT refuses", SELLER, "accept-bid", [uintCV(id(3)), uintCV(1445), cp(BPEPE)], "(err u106)");
evalc("bid C untouched", `(get-bid u${id(3)})`);
call("cancel C", BIDDER, "cancel-bid", [uintCV(id(3))], `(ok u${STX(1)})`);
call("fee back to 2.5%", ADMIN, "set-platform-fee", [uintCV(250)], "(ok true)");
setColl("royalty back to 2.5%", true, 250, ROYALTY);
call(`bid D: 39 uSTX x1 (fees round to 0) -> ${id(4)}`, BIDDER, "place-bid", [nft, uintCV(39), uintCV(1)], `(ok u${id(4)})`);
evalc("quote D", `(quote-fill u${id(4)})`);
call("cancel D", BIDDER, "cancel-bid", [uintCV(id(4))], "(ok u39)");

// ---- recipients aimed at the seller and at the contract itself ----
setColl("royalty recipient = SELLER (self-royalty)", true, 250, SELLER);
call("platform recipient = SELLER", ADMIN, "set-platform-recipient", [principalCV(SELLER)], "(ok true)");
call(`bid E: 2 STX x1 -> ${id(5)}`, BIDDER, "place-bid", [nft, uintCV(STX(2)), uintCV(1)], `(ok u${id(5)})`);
evalc("seller 3", stxBal(SELLER), "S3");
// Seller is also both fee recipients: all three transfers land on the seller.
call("seller fills E with #964 (seller is also both fee recipients)", SELLER, "accept-bid", [uintCV(id(5)), uintCV(964), cp(BPEPE)], "(ok true)");
evalc("seller 4", stxBal(SELLER), "S4");
setColl("royalty recipient = the bids contract itself", true, 250, CID);
call("platform recipient = the bids contract itself", ADMIN, "set-platform-recipient", [principalCV(CID)], "(ok true)");
call(`bid F: 2 STX x1 -> ${id(6)}`, BIDDER, "place-bid", [nft, uintCV(STX(2)), uintCV(1)], `(ok u${id(6)})`);
// Admin footgun: a fee recipient equal to the bids contract itself makes
// stx-transfer? refuse (sender == recipient, err u2), so every fill on that
// collection REVERTS until the admin fixes the recipient. Nothing is stuck:
// the bid stays open and cancellable. Documented in the README.
evalc("contract before F", stxBal(CID), "CF0");
call("fill F reverts: fee recipient == contract (stx-transfer u2)", SELLER, "accept-bid", [uintCV(id(6)), uintCV(967), cp(BPEPE)], "(err u2)");
evalc("bid F still open", `(get-bid u${id(6)})`);
evalc("#967 still with seller", owner(967));
call("bidder can still cancel F", BIDDER, "cancel-bid", [uintCV(id(6))], `(ok u${STX(2)})`);
evalc("contract after F cancel", stxBal(CID), "CF1");
call("platform recipient restored", ADMIN, "set-platform-recipient", [principalCV(PLATFORM)], "(ok true)");
setColl("royalty restored", true, 250, ROYALTY);

// ---- overflow attempts ----
evalc("last bid id before overflow attempt", "(get-last-bid-id)", "L0");
call("place-bid price 2^126 x 100 overflows -> runtime abort", BIDDER, "place-bid", [nft, uintCV(HUGE), uintCV(100)], "ABORT");
evalc("last bid id unchanged", "(get-last-bid-id)", "L1");
call(`bid G: 1 STX x2 -> ${id(7)}`, BIDDER, "place-bid", [nft, uintCV(STX(1)), uintCV(2)], `(ok u${id(7)})`);
call("re-price to 2^126 x2 fits u128 -> insufficient STX (u1), no overflow", BIDDER, "update-bid-price", [uintCV(id(7)), uintCV(HUGE)], "(err u1)");
evalc("bid G untouched", `(get-bid u${id(7)})`);

// ---- collection disabled with an open bid ----
setColl("disable bitcoin-pepe", false, 250, ROYALTY);
call("no new bids", BIDDER, "place-bid", [nft, uintCV(STX(1)), uintCV(1)], "(err u302)");
call("no fills", SELLER, "accept-bid", [uintCV(id(7)), uintCV(1445), cp(BPEPE)], "(err u302)");
call("no re-price", BIDDER, "update-bid-price", [uintCV(id(7)), uintCV(STX(3))], "(err u302)");
call("cancel still refunds", BIDDER, "cancel-bid", [uintCV(id(7))], `(ok u${STX(2)})`);
setColl("re-enable", true, 250, ROYALTY);

// ---- lying NFT: paid without moving (documented trust boundary) ----
const LIAR = `${RANDOM}.liar-nft-stx`;
b.withSender(RANDOM).addContractDeploy({ contract_name: "liar-nft-stx", clarity_version: ClarityVersion.Clarity4, source_code: `(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(define-non-fungible-token liar uint)
(define-read-only (get-last-token-id) (ok u1))
(define-read-only (get-token-uri (id uint)) (ok none))
(define-read-only (get-owner (id uint)) (ok (nft-get-owner? liar id)))
(define-public (transfer (id uint) (sender principal) (recipient principal)) (ok true))
(define-public (mint (to principal)) (nft-mint? liar u1 to))` });
plan.push({ kind: "deploy", label: "deploy liar-nft-stx" });
callOn("mint liar #1 to SELLER", RANDOM, LIAR, "mint", [principalCV(SELLER)], "(ok true)");
call("admin whitelists liar (the mistake the rule forbids)", ADMIN, "set-collection", [principalCV(LIAR), boolCV(true), uintCV(0), principalCV(ROYALTY)], "(ok true)");
call(`bid H: 1 STX on liar -> ${id(8)}`, BIDDER, "place-bid", [principalCV(LIAR), uintCV(STX(1)), uintCV(1)], `(ok u${id(8)})`);
evalc("seller 5", stxBal(SELLER), "S5");
call("liar fill pays although nothing moved", SELLER, "accept-bid", [uintCV(id(8)), uintCV(1), cp([RANDOM, "liar-nft-stx"])], "(ok true)");
evalc("liar #1 still with SELLER", `(contract-call? '${LIAR} get-owner u1)`);
evalc("seller 6", stxBal(SELLER), "S6");
call("admin disables liar", ADMIN, "set-collection", [principalCV(LIAR), boolCV(false), uintCV(0), principalCV(ROYALTY)], "(ok true)");

// ---- proposal overwrite / cancel; pause interplay ----
call("nothing to cancel", ADMIN, "cancel-fakfun-proposal", [], "(err u315)");
call("propose self", ADMIN, "propose-fakfun", [principalCV(ADMIN)], "(err u314)");
call("propose RANDOM", ADMIN, "propose-fakfun", [principalCV(RANDOM)], "(ok true)");
call("overwrite with SELLER", ADMIN, "propose-fakfun", [principalCV(SELLER)], "(ok true)");
call("admin pauses", ADMIN, "set-paused", [boolCV(true)], "(ok true)");
advance(144);
call("RANDOM (overwritten) cannot accept", RANDOM, "accept-fakfun", [], "(err u300)");
call("admin cancels proposal while paused", ADMIN, "cancel-fakfun-proposal", [], "(ok true)");
call("SELLER cannot accept cancelled", SELLER, "accept-fakfun", [], "(err u315)");
call("unpause", ADMIN, "set-paused", [boolCV(false)], "(ok true)");
evalc("fakfun unchanged", "(get-fakfun)");
evalc("contract final", stxBal(CID), "C6");
evalc("last bid id", "(get-last-bid-id)");

const dtx = (s) => { const t = s?.Result?.Transaction; if (!t) return "<none>"; if ("Err" in t) return `ABORT`; try { return cvToString(deserializeCV(t.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; } };
const dev = (s) => { const t = s?.Result?.Eval; if (!t) return "<none>"; if (!("Ok" in t)) return `ERR: ${t.Err}`; try { return cvToString(deserializeCV(t.Ok)); } catch { return t.Ok; } };
const u = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
const sessionId = await b.run();
const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
console.log(`Submitted ${url}\n`);
const res = await getSimulationResult(sessionId);
const cap = {}; let pass = 0, fail = 0;
res.steps.forEach((s, i) => {
  const p = plan[i]; if (!p) return;
  if (p.kind === "deploy") { const ok = !("Err" in (s?.Result?.Transaction || {})); console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}`); ok ? pass++ : fail++; }
  else if (p.kind === "tx") { const got = dtx(s); const ok = got === p.expect || (p.expect === "ABORT" && (got.startsWith("ABORT") || got === "(err none)")); console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
  else if (p.kind === "eval") { const v = dev(s); if (p.capture) cap[p.capture] = v; console.log(`ℹ️  [${i}] ${p.label}: ${v}`); }
  else console.log(`⏩ [${i}] ${p.label}`);
});
const near = (got, want, slack) => got >= want - slack && got <= want; // seller pays tx fees
const FEE = 60_000n; // uSTX of tx fees a party may pay between two captures
const checks = [
  ["fill A: seller +8.5 STX (10%+5%) less tx fee", near(u(cap.S1) - u(cap.S0), BigInt(STX(8.5)), FEE), true],
  ["fill A: royalty +1 STX", u(cap.R1) - u(cap.R0), BigInt(STX(1))],
  ["fill A: platform2 +0.5 STX", u(cap.P1) - u(cap.P0), BigInt(STX(0.5))],
  ["B escrow 12 -> 8 -> 12 -> 4 -> 0", [u(cap.C1) - u(cap.C0), u(cap.C2) - u(cap.C0), u(cap.C3) - u(cap.C0), u(cap.C4) - u(cap.C0), u(cap.C5) - u(cap.C0)].join(","), [STX(12), STX(8), STX(12), STX(4), 0].map(BigInt).join(",")],
  ["fill E: seller gets the FULL 2 STX (net + both fees) less tx fee", near(u(cap.S4) - u(cap.S3), BigInt(STX(2)), FEE), true],
  ["F: escrow fully returned after the unfillable bid is cancelled", u(cap.CF1) - u(cap.CF0), BigInt(-STX(2))],
  ["overflow attempt created no bid", u(cap.L1) - u(cap.L0), 0n],
  ["liar fill: seller +1 STX less tx fee", near(u(cap.S6) - u(cap.S5), BigInt(STX(1)), FEE), true],
  ["contract ends where it started", u(cap.C6) - u(cap.C0), 0n],
];
for (const [label, got, want] of checks) { const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (want ${want})`); ok ? pass++ : fail++; }
console.log(`\n=== ${pass} passed, ${fail} failed ===\n${url}`);
if (fail > 0) process.exit(1);
