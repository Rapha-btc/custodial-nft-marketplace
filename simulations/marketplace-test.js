// marketplace-test.js
// Comprehensive test simulation for pepe-marketplace contract
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  boolCV,
  noneCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

// ============================================================
// PRINCIPALS
// ============================================================
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // Marketplace deployer/admin
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP"; // Owns pepe NFTs
const BUYER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2"; // Has 421M PEPE tokens
const RANDOM_USER = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // Random attacker

// ============================================================
// CONTRACTS
// ============================================================
const MARKETPLACE = `${DEPLOYER}.pepe-marketplace`;
const BITCOIN_PEPE_NFT = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const PEPE_TOKEN = "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz";
const NOT_WHITELISTED_TOKEN = "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT.notastrategy";

// ============================================================
// NFT IDs owned by SELLER
// ============================================================
const SELLER_NFT_IDS = [137, 139, 178, 267, 274, 334, 335, 340, 388, 490, 638];

// ============================================================
// PRICES (PEPE has 3 decimals, so multiply by 1000)
// ============================================================
const PRICE_10M_PEPE = 10000000000; // 10M PEPE = 10,000,000 * 1000
const PRICE_50M_PEPE = 50000000000; // 50M PEPE
const PRICE_100M_PEPE = 100000000000; // 100M PEPE
const PRICE_422M_PEPE = 422000000000; // 422M PEPE - more than buyer has!

async function main() {
  console.log("=== PEPE MARKETPLACE - COMPREHENSIVE TEST SIMULATION ===\n");
  console.log("Deployer/Admin:", DEPLOYER);
  console.log("Seller (NFT owner):", SELLER);
  console.log("Buyer (has 421M PEPE):", BUYER);
  console.log("Random user:", RANDOM_USER);
  console.log("\n");

  console.log("=== HAPPY PATH TESTS ===");
  console.log("1. Deploy marketplace contract");
  console.log("2. Initialize with bitcoin-pepe NFT");
  console.log("3. Whitelist PEPE token for payments");
  console.log("4. Seller lists NFT #137 for 10M PEPE");
  console.log("5. Buyer purchases NFT #137");
  console.log("6. Seller lists NFT #139, then unlists it");
  console.log("7. Seller lists NFT #178, updates price");
  console.log("8. Seller lists NFT #267, changes FT and price");
  console.log("\n");

  console.log("=== EXPECTED FAILURE TESTS ===");
  console.log("9. List with non-whitelisted FT (ERR-FT-NOT-WHITELISTED u105)");
  console.log("10. Buy with insufficient funds - 422M price (transfer fails)");
  console.log("11. Buy own NFT (ERR-CANNOT-BUY-OWN u108)");
  console.log("12. Unlist someone else's NFT (ERR-NOT-OWNER u104)");
  console.log("13. Buy with wrong FT contract (ERR-WRONG-FT u113)");
  console.log("14. Initialize twice (ERR-ALREADY-INITIALIZED u111)");
  console.log("15. Non-admin tries to whitelist FT (ERR-NOT-AUTHORIZED u100)");
  console.log("16. Non-admin tries to pause (ERR-NOT-AUTHORIZED u100)");
  console.log("17. Buy when paused (ERR-PAUSED u109)");
  console.log("18. List NFT not owned (transfer fails)");
  console.log("\n");

  SimulationBuilder.new()
    // ============================================================
    // STEP 1: Deploy marketplace contract
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
    // STEP 2: Initialize with bitcoin-pepe NFT
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [
        principalCV(BITCOIN_PEPE_NFT),
      ],
    })

    // ============================================================
    // STEP 3: Whitelist PEPE token for payments
    // Expected: (ok true)
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
    // STEP 4: Seller lists NFT #137 for 10M PEPE
    // Expected: (ok true)
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137), // token-id
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ), // nft-contract
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ), // ft-contract
        uintCV(PRICE_10M_PEPE), // price
      ],
    })

    // ============================================================
    // STEP 5: Buyer purchases NFT #137
    // Expected: (ok true)
    // Fee split: 2.5% royalty + 2.5% platform = 5% fees
    // Seller receives 95% = 9.5M PEPE
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137), // token-id
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ), // nft-contract
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ), // ft-contract
      ],
    })

    // ============================================================
    // STEP 6a: Seller lists NFT #139
    // Expected: (ok true)
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(139),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_50M_PEPE),
      ],
    })

    // ============================================================
    // STEP 6b: Seller unlists NFT #139
    // Expected: (ok true) - NFT returned to seller
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(139),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 7a: Seller lists NFT #178
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(178),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_50M_PEPE),
      ],
    })

    // ============================================================
    // STEP 7b: Seller updates price on NFT #178
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [
        uintCV(178),
        uintCV(PRICE_100M_PEPE), // new price: 100M PEPE
      ],
    })

    // ============================================================
    // STEP 8a: Seller lists NFT #267
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(267),
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
    // STEP 8b: Seller updates listing FT and price on NFT #267
    // (Still PEPE token, just testing the function)
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-listing-ft",
      function_args: [
        uintCV(267),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_50M_PEPE),
      ],
    })

    // ============================================================
    // === EXPECTED FAILURE TESTS ===
    // ============================================================

    // ============================================================
    // STEP 9: List with non-whitelisted FT
    // Expected: (err u105) ERR-FT-NOT-WHITELISTED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // NOT WHITELISTED!
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // STEP 10a: Seller lists NFT #274 at insane price (422M PEPE)
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_422M_PEPE), // Buyer only has 421M!
      ],
    })

    // ============================================================
    // STEP 10b: Buyer tries to buy NFT #274 but can't afford it
    // Expected: FT transfer fails (insufficient balance)
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(274),
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
    // STEP 11: Seller tries to buy own NFT #267
    // Expected: (err u108) ERR-CANNOT-BUY-OWN
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(267), // Listed by SELLER
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
    // STEP 12: Random user tries to unlist seller's NFT #178
    // Expected: (err u104) ERR-NOT-OWNER
    // ============================================================
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(178), // Listed by SELLER, not RANDOM_USER
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 13: Buyer tries to buy with wrong FT contract
    // Expected: (err u113) ERR-WRONG-FT
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(178), // Listed for PEPE token
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // WRONG FT!
      ],
    })

    // ============================================================
    // STEP 14: Admin tries to initialize again
    // Expected: (err u111) ERR-ALREADY-INITIALIZED
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [
        principalCV(BITCOIN_PEPE_NFT),
      ],
    })

    // ============================================================
    // STEP 15: Random user tries to whitelist FT
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ),
        boolCV(true),
      ],
    })

    // ============================================================
    // STEP 16: Random user tries to pause contract
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(true)],
    })

    // ============================================================
    // STEP 17a: Admin pauses the contract
    // Expected: (ok true)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(true)],
    })

    // ============================================================
    // STEP 17b: Buyer tries to buy when paused
    // Expected: (err u109) ERR-PAUSED
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(178),
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
    // STEP 17c: Admin unpauses the contract
    // Expected: (ok true)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(false)],
    })

    // ============================================================
    // STEP 18: Random user tries to list NFT they don't own
    // Expected: NFT transfer fails (not owner)
    // ============================================================
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(334), // Owned by SELLER, not RANDOM_USER
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
    // STEP 19: Admin emergency return - return NFT #274 to seller
    // Expected: (ok true)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "admin-emergency-return",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 20: Buyer successfully purchases NFT #178 (100M PEPE)
    // Expected: (ok true)
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(178),
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

    .run()
    .catch(console.error);
}

main();
