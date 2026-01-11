// ft-unwhitelist-test.js
// Test FT un-whitelist behavior: buy blocked, unlist still works
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  boolCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

// ============================================================
// PRINCIPALS
// ============================================================
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP";
const BUYER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";

// ============================================================
// CONTRACTS
// ============================================================
const MARKETPLACE = `${DEPLOYER}.pepe-marketplace`;
const BITCOIN_PEPE_NFT = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const PEPE_TOKEN = "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz";

const PRICE_10M_PEPE = 10000000000;

async function main() {
  console.log("=== FT UN-WHITELIST TEST ===\n");
  console.log("Tests that:");
  console.log("1. Buy is blocked when FT is un-whitelisted (ERR-FT-NOT-WHITELISTED u204)");
  console.log("2. Seller can still unlist when FT is un-whitelisted (ok true)");
  console.log("3. Buy works again after FT is re-whitelisted (ok true)");
  console.log("\n");

  SimulationBuilder.new()
    // ============================================================
    // Step 1: Deploy contract
    // ============================================================
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: "pepe-marketplace",
      source_code: fs.readFileSync(
        "./contracts/pepe-marketplace.clar",
        "utf8"
      ),
      clarity_version: ClarityVersion.Clarity4,
    })

    // ============================================================
    // Step 2: Initialize
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [
        principalCV(BITCOIN_PEPE_NFT),
      ],
    })

    // ============================================================
    // Step 3: Whitelist PEPE token
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        boolCV(true),
      ],
    })

    // ============================================================
    // Step 4: Seller lists NFT #137
    // Expected: (ok true)
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // Step 5: Admin UN-WHITELISTS the PEPE token
    // Expected: (ok true)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        boolCV(false), // UN-WHITELIST!
      ],
    })

    // ============================================================
    // Step 6: Buyer tries to buy - SHOULD FAIL!
    // Expected: (err u204) ERR-FT-NOT-WHITELISTED
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // Step 7: Seller can still UNLIST even with un-whitelisted FT
    // Expected: (ok true) - seller must be able to reclaim NFT!
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // Step 8: Admin RE-WHITELISTS the PEPE token
    // Expected: (ok true)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        boolCV(true), // RE-WHITELIST
      ],
    })

    // ============================================================
    // Step 9: Seller lists NFT #137 again
    // Expected: (ok true)
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // Step 10: Buyer can now buy after FT is re-whitelisted
    // Expected: (ok true)
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // BONUS: Test that listing with un-whitelisted FT also fails
    // ============================================================

    // Step 11: Un-whitelist again
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        boolCV(false),
      ],
    })

    // Step 12: Try to list with un-whitelisted FT
    // Expected: (err u204) ERR-FT-NOT-WHITELISTED
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(139), // Different NFT
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    .run()
    .catch(console.error);
}

main();
