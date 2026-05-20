// dawg-tails-hammer.js
// Comprehensive "hammer" simulation for the dawg-tails / dawgpool
// custodial marketplace. Covers everything in dawg-tails-marketplace-
// test.js plus the gaps flagged in DAWG-TAILS-SIM-RESULTS.md:
//
//   - pre-init list/buy            (NOT-INITIALIZED u210)
//   - wrong NFT contract           (WRONG-NFT u208)
//   - price = 0                    (INVALID-PRICE u205)
//   - ops on non-listed tokens     (NOT-LISTED u202)
//   - admin bounds                 (royalty > 10% / platform > 5%)
//   - FT un-whitelist mid-life     (buy fails after FT is un-whitelisted)
//   - stale listings               (re-list after buy / unlist / emergency)
//   - royalty + platform fee event capture on buys
//
// Deploys a fresh `dawg-tails-mkt-hammer` to avoid any shared state
// with dawg-tails-marketplace-test.js.
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  boolCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

// ── PRINCIPALS ─────────────────────────────────────────────────────
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER1 = "SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY";   // 2,4,7,9,14
const SELLER2 = "SP2Z2CBMGWB9MQZAF5Z8X56KS69XRV3SJF4WKJ7J9";   // 3,8,19,25
const BUYER = "SP389APB4DHZ836P4AE9RJW7EKEZAPV5NPDNG7N46";
const RANDOM_USER = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// Royalty + platform recipients we'll set during the sim — these are
// real principals so the FT transfer events have somewhere to land.
const ROYALTY_RECIPIENT = "SP1CSHTKVHMMQJ7PRQRFYW6SB4QAW6SR3XY2F81PA";
const PLATFORM_RECIPIENT = "SP280XKQ2T1V0NBE23MCAT0KS6P6MHV6RC8B2CWVJ";

// ── CONTRACTS ──────────────────────────────────────────────────────
const MARKETPLACE_NAME = "dawg-tails-mkt-hammer";
const MARKETPLACE = `${DEPLOYER}.${MARKETPLACE_NAME}`;
const DAWG_NFT = "SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV.the-dawg-tails-collection";
const DAWG_NFT_ADDR = "SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV";
const DAWG_NFT_NAME = "the-dawg-tails-collection";
const WRONG_NFT_ADDR = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ";
const WRONG_NFT_NAME = "bitcoin-pepe";
const DAWGPOOL_FT_ADDR = "SPQYMRAKZPQPJAADX5JBEFT0FHE3RZZK9F8TYBQ3";
const DAWGPOOL_FT_NAME = "dawgpool-stxcity";
const BAD_FT_ADDR = "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT";
const BAD_FT_NAME = "notastrategy";

const SELLER1_IDS = [2, 4, 7, 9, 14];
const SELLER2_IDS = [3, 8, 19];

const ONE = 1_000_000n;
const num = (n) => Number(BigInt(n) * ONE);

const nft = () => contractPrincipalCV(DAWG_NFT_ADDR, DAWG_NFT_NAME);
const wrongNft = () => contractPrincipalCV(WRONG_NFT_ADDR, WRONG_NFT_NAME);
const ft = () => contractPrincipalCV(DAWGPOOL_FT_ADDR, DAWGPOOL_FT_NAME);
const badFt = () => contractPrincipalCV(BAD_FT_ADDR, BAD_FT_NAME);

async function main() {
  console.log("=== DAWG-TAILS HAMMER SIM ===");
  console.log("Marketplace:", MARKETPLACE);
  console.log("NFT:", DAWG_NFT);
  console.log("FT:", `${DAWGPOOL_FT_ADDR}.${DAWGPOOL_FT_NAME}`);
  console.log();

  SimulationBuilder.new()
    // ── STEP 0: Deploy fresh marketplace ────────────────────────
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: MARKETPLACE_NAME,
      source_code: fs.readFileSync("./contracts/pepe-marketplace.clar", "utf8"),
      clarity_version: ClarityVersion.Clarity4,
    })

    // ── PRE-INIT FAILURES ────────────────────────────────────────
    // STEP 1: list-nft before init → ERR-NOT-INITIALIZED u210
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(2), nft(), ft(), uintCV(num(100))],
    })
    // STEP 2: buy-nft before init → also blocked (no listings exist, so
    // expect NOT-LISTED rather than NOT-INITIALIZED — but contract checks
    // init first in some paths; documenting actual behaviour).
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(2), nft(), ft()],
    })

    // ── INIT + WRONG NFT CONTRACT ─────────────────────────────────
    // STEP 3: initialize for dawg-tails NFT
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [principalCV(DAWG_NFT)],
    })
    // STEP 4: try to list bitcoin-pepe via this marketplace → ERR-WRONG-NFT
    // (SELLER1 doesn't own bitcoin-pepe NFTs but trait check + nft-match
    // should fire first)
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(2), wrongNft(), ft(), uintCV(num(100))],
    })

    // ── PRE-FT-WHITELIST ──────────────────────────────────────────
    // STEP 5: list with valid NFT but FT not yet whitelisted → ERR-FT-NOT-WHITELISTED
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(2), nft(), ft(), uintCV(num(100))],
    })
    // STEP 6: whitelist dawgpool
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [ft(), boolCV(true)],
    })

    // ── INVALID PARAMS ────────────────────────────────────────────
    // STEP 7: list with price = 0 → ERR-INVALID-PRICE u205
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(2), nft(), ft(), uintCV(0)],
    })

    // ── ADMIN BOUNDS ──────────────────────────────────────────────
    // STEP 8: set-royalty-percent > 10% (max 1000bps) → unauthorized error
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-royalty-percent",
      function_args: [uintCV(1500)],
    })
    // STEP 9: set-platform-fee > 5% (max 500bps) → unauthorized error
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-platform-fee",
      function_args: [uintCV(600)],
    })
    // STEP 10: legitimate set-royalty-recipient
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-royalty-recipient",
      function_args: [principalCV(ROYALTY_RECIPIENT)],
    })
    // STEP 11: legitimate set-platform-recipient
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-platform-recipient",
      function_args: [principalCV(PLATFORM_RECIPIENT)],
    })

    // ── HAPPY-PATH LISTINGS (all 8 NFTs) ──────────────────────────
    .withSender(SELLER1)
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(2), nft(), ft(), uintCV(num(100))] }) // 12
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(4), nft(), ft(), uintCV(num(200))] }) // 13
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(7), nft(), ft(), uintCV(num(300))] }) // 14
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(9), nft(), ft(), uintCV(num(400))] }) // 15
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(14), nft(), ft(), uintCV(num(500))] }) // 16
    .withSender(SELLER2)
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(3), nft(), ft(), uintCV(num(600))] }) // 17
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(8), nft(), ft(), uintCV(num(700))] }) // 18
    .addContractCall({ contract_id: MARKETPLACE, function_name: "list-nft",
      function_args: [uintCV(19), nft(), ft(), uintCV(num(800))] }) // 19

    // ── OPS ON NON-LISTED TOKENS ─────────────────────────────────
    // STEP 20: update-price on token 99 (never listed) → ERR-NOT-LISTED u202
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [uintCV(99), uintCV(num(100))],
    })
    // STEP 21: unlist-nft on token 99 → ERR-NOT-LISTED
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [uintCV(99), nft()],
    })
    // STEP 22: update-listing-ft on token 99 → ERR-NOT-LISTED
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-listing-ft",
      function_args: [uintCV(99), ft(), uintCV(num(100))],
    })
    // STEP 23: update-price to 0 on a real listing → ERR-INVALID-PRICE
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [uintCV(2), uintCV(0)],
    })

    // ── HAPPY BUY (verifies royalty + platform split via FT events) ──
    // STEP 24: BUYER buys #7 @ 300 dawgpool. Expect:
    //   - 300_000_000 dawgpool from BUYER → splits:
    //     7_500_000 to ROYALTY_RECIPIENT (2.5%)
    //     7_500_000 to PLATFORM_RECIPIENT (2.5%)
    //     285_000_000 to SELLER1 (95%)
    //   - NFT #7 from MARKETPLACE → BUYER
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(7), nft(), ft()],
    })

    // ── STALE LISTING (post-buy) ─────────────────────────────────
    // STEP 25: update-price on already-sold #7 → ERR-NOT-LISTED
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [uintCV(7), uintCV(num(999))],
    })
    // STEP 26: try to buy #7 again → ERR-NOT-LISTED
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(7), nft(), ft()],
    })

    // ── FT UN-WHITELIST MID-LIFE ─────────────────────────────────
    // STEP 27: DEPLOYER un-whitelists dawgpool
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [ft(), boolCV(false)],
    })
    // STEP 28: try to buy existing listing #8 with un-whitelisted FT
    //   → ERR-FT-NOT-WHITELISTED (buy-nft re-checks whitelist)
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(8), nft(), ft()],
    })
    // STEP 29: try to list new NFT in un-whitelisted FT → same error
    .withSender(SELLER2)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(25), nft(), ft(), uintCV(num(900))],
    })
    // STEP 30: DEPLOYER re-whitelists dawgpool
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [ft(), boolCV(true)],
    })
    // STEP 31: BUYER successfully buys #8 (post re-whitelist) — second
    // verified happy path, this one against SELLER2
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(8), nft(), ft()],
    })

    // ── UNLIST + RE-LIST (stale slot test) ───────────────────────
    // STEP 32: SELLER1 unlists #4
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [uintCV(4), nft()],
    })
    // STEP 33: SELLER1 re-lists #4 at a new price → should succeed cleanly
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(4), nft(), ft(), uintCV(num(250))],
    })

    // ── EMERGENCY RETURN + RE-LIST ───────────────────────────────
    // STEP 34: DEPLOYER emergency-returns #14 to SELLER1
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "admin-emergency-return",
      function_args: [uintCV(14), nft()],
    })
    // STEP 35: SELLER1 tries update-price on returned #14 → ERR-NOT-LISTED
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [uintCV(14), uintCV(num(550))],
    })
    // STEP 36: SELLER1 re-lists #14 cleanly post emergency-return
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(14), nft(), ft(), uintCV(num(550))],
    })

    // ── BUY #19 → captures another royalty/platform split event ──
    // STEP 37: BUYER buys #19 @ 800 dawgpool
    //   royalty 20_000_000  /  platform 20_000_000  /  seller2 760_000_000
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(19), nft(), ft()],
    })

    .run()
    .catch(console.error);
}

main();
