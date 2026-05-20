// dawg-tails-router-wrapper.js
// Deploys a dawg-tails marketplace using the lambda-nft-marketplace
// template (which conforms to fakfun-nftmarket-trait + self-registers
// with fakfun-nfts-core via hash verification).
//
// Once deployed + initialized, L/X wallets can buy / sell dawg-tails
// NFTs by calling fakfun-nfts-core.list-nft / buy-nft / etc. — every op
// routes through core, which prints log events the fakfun indexer
// already understands. No new wrapper logic needed: the lambda template
// IS the wrapper.
//
// Flow:
//   1. DEPLOYER deploys lambda-nft-marketplace (source-of-truth for hash)
//   2. DEPLOYER set-verified-contract for the lambda — registers its hash
//   3. DEPLOYER deploys dawg-tails-marketplace (IDENTICAL source) — same
//      bytecode hash, so it can self-register against the lambda's hash
//   4. DEPLOYER calls dawg-tails-marketplace.initialize(dawg-tails-collection)
//      → internally calls fakfun-nfts-core.register-marketplace via
//        as-contract?; core verifies caller-hash == verified-hash ✅
//   5. DEPLOYER whitelists dawgpool-stxcity
//   6. SELLER1 lists NFT #2 via fakfun-nfts-core.list-nft(dawg-tails-mkt,…)
//      → core prints nft-listed event + delegates to wrapper.list-nft
//   7. BUYER buys via fakfun-nfts-core.buy-nft(dawg-tails-mkt,…)
//      → core prints nft-sold event + delegates to wrapper.buy-nft
//   8. Read get-marketplace-info to confirm registration landed
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  stringAsciiCV,
  noneCV,
  boolCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

// ── PRINCIPALS ─────────────────────────────────────────────────────
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // fakfun deployer (matches CONTRACT-OWNER + fakfun-nfts-core admin)
const SELLER1 = "SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY"; // dawg #2,4,7,9,14
const SELLER2 = "SP2Z2CBMGWB9MQZAF5Z8X56KS69XRV3SJF4WKJ7J9"; // dawg #3,8,19,25
const BUYER = "SP389APB4DHZ836P4AE9RJW7EKEZAPV5NPDNG7N46";

// ── CONTRACTS ──────────────────────────────────────────────────────
const CORE = `${DEPLOYER}.fakfun-nfts-core`;
const LAMBDA = `${DEPLOYER}.lambda-nft-marketplace`;
const WRAPPER = `${DEPLOYER}.dawg-tails-marketplace`;
const DAWG_NFT = "SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV.the-dawg-tails-collection";
const DAWG_NFT_ADDR = "SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV";
const DAWG_NFT_NAME = "the-dawg-tails-collection";
const DAWGPOOL_FT_ADDR = "SPQYMRAKZPQPJAADX5JBEFT0FHE3RZZK9F8TYBQ3";
const DAWGPOOL_FT_NAME = "dawgpool-stxcity";

const nft = () => contractPrincipalCV(DAWG_NFT_ADDR, DAWG_NFT_NAME);
const ft = () => contractPrincipalCV(DAWGPOOL_FT_ADDR, DAWGPOOL_FT_NAME);
const wrapper = () => contractPrincipalCV(DEPLOYER, "dawg-tails-marketplace");

const ONE = 1_000_000n;
const price = (n) => Number(BigInt(n) * ONE);

async function main() {
  console.log("=== DAWG-TAILS — fakfun-nfts-core router wrapper sim ===");
  console.log("Core:", CORE);
  console.log("Lambda (template):", LAMBDA);
  console.log("Wrapper (clone):", WRAPPER);
  console.log("NFT:", DAWG_NFT);
  console.log("FT:", `${DAWGPOOL_FT_ADDR}.${DAWGPOOL_FT_NAME}`);
  console.log();

  const lambdaSource = fs.readFileSync(
    "./contracts/lambda-nft-marketplace.clar",
    "utf8",
  );

  SimulationBuilder.new()
    // ── STEP 0: Deploy the lambda template (source-of-truth for hash) ──
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: "lambda-nft-marketplace",
      source_code: lambdaSource,
      clarity_version: ClarityVersion.Clarity4,
    })

    // ── STEP 1: Verify the lambda's hash on fakfun-nfts-core ──
    // Auto-hash mode (pass none) — core computes the hash from the
    // deployed lambda contract.
    .addContractCall({
      contract_id: CORE,
      function_name: "set-verified-contract",
      function_args: [principalCV(LAMBDA), noneCV()],
    })

    // ── STEP 2: Deploy the dawg-tails-marketplace clone ──
    // IDENTICAL source = identical bytecode hash → can self-register
    // against the lambda's verified hash.
    .addContractDeploy({
      contract_name: "dawg-tails-marketplace",
      source_code: lambdaSource,
      clarity_version: ClarityVersion.Clarity4,
    })

    // ── STEP 3: Initialize the wrapper → self-registers with core ──
    // initialize() inside the lambda template calls
    //   (as-contract? () (contract-call? CORE register-marketplace
    //       LAMBDA <nft-contract> <name>))
    // contract-caller from core's POV = dawg-tails-marketplace.
    // Core verifies: hash(dawg-tails-marketplace) == verified-hash(lambda)
    // → match → marketplace registered as dawg-tails-marketplace.
    .addContractCall({
      contract_id: WRAPPER,
      function_name: "initialize",
      function_args: [principalCV(DAWG_NFT), stringAsciiCV("Dawg Tails")],
    })

    // ── STEP 4: Whitelist dawgpool-stxcity for payments on the wrapper ──
    .addContractCall({
      contract_id: WRAPPER,
      function_name: "whitelist-ft",
      function_args: [ft(), boolCV(true)],
    })

    // ── STEP 5: SELLER1 lists NFT #2 THROUGH fakfun-nfts-core ──
    // Core verifies wrapper is registered → delegates to wrapper.list-nft
    // → wrapper handles custody. Core prints nft-listed event.
    .withSender(SELLER1)
    .addContractCall({
      contract_id: CORE,
      function_name: "list-nft",
      function_args: [
        wrapper(), // marketplace
        uintCV(2), // token-id
        nft(),
        ft(),
        uintCV(price(100)),
      ],
    })

    // ── STEP 6: SELLER1 lists NFT #4 through core ──
    .addContractCall({
      contract_id: CORE,
      function_name: "list-nft",
      function_args: [wrapper(), uintCV(4), nft(), ft(), uintCV(price(200))],
    })

    // ── STEP 7: SELLER2 lists NFT #3 through core ──
    .withSender(SELLER2)
    .addContractCall({
      contract_id: CORE,
      function_name: "list-nft",
      function_args: [wrapper(), uintCV(3), nft(), ft(), uintCV(price(300))],
    })

    // ── STEP 8: BUYER buys NFT #2 via core ──
    // Core prints nft-sold + delegates to wrapper.buy-nft.
    .withSender(BUYER)
    .addContractCall({
      contract_id: CORE,
      function_name: "buy-nft",
      function_args: [wrapper(), uintCV(2), nft(), ft()],
    })

    // ── STEP 9: SELLER1 updates price on #4 via core ──
    .withSender(SELLER1)
    .addContractCall({
      contract_id: CORE,
      function_name: "update-price",
      function_args: [wrapper(), uintCV(4), uintCV(price(250))],
    })

    // ── STEP 10: SELLER1 unlists #4 via core ──
    .addContractCall({
      contract_id: CORE,
      function_name: "unlist-nft",
      function_args: [wrapper(), uintCV(4), nft()],
    })

    // ── STEP 11: BUYER buys NFT #3 via core (cross-seller) ──
    .withSender(BUYER)
    .addContractCall({
      contract_id: CORE,
      function_name: "buy-nft",
      function_args: [wrapper(), uintCV(3), nft(), ft()],
    })

    .run()
    .catch(console.error);
}

main();
