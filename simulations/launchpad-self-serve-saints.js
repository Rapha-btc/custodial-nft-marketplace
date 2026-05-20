// End-to-end self-serve launchpad sim for saints.
//
// Flow being verified:
//   1. FAK admin deploys the canonical template (name-nft-market-faktory.clar source)
//   2. FAK admin calls set-verified-contract(<template-principal>, none) so the registry
//      records the on-chain hash of the template
//   3. User (saints collection deployer) deploys their own clone "saints-nft-market-faktory"
//      with byte-identical source
//   4. User calls initialize(<saints-nft-principal>)
//   5. User whitelists sBTC for payments
//   6. User calls register-nft-marketplace(<template-principal>, "saints") — this proxies into
//      fakfun-nfts-core.register-marketplace via as-contract. The registry compares the
//      caller's contract-hash to the verified-hash for the template principal and accepts
//      because the source bytes are identical.
//   7. Verify: get-marketplace-info(<saints-mkt>) returns the registration tuple
//   8. Saints holder lists token #1 by calling fakfun-nfts-core.list-nft (the central proxy)
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  boolCV,
  noneCV,
  stringAsciiCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

const ADMIN = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";          // FAK admin / fakfun-nfts-core deployer
const USER = "SP1HRK5ZWS3DC0KVSKK7GF32KYJ0TGDE90KXDFC3H";           // also the saints #1 holder; doubles as the user deploying their marketplace
const CORE = [ADMIN, "fakfun-nfts-core"];
const TEMPLATE_NAME = "template-nft-market-faktory";                 // canonical reference deploy
const USER_MKT_NAME = "saints-nft-market-faktory";                   // user's per-collection deploy
const SAINTS = ["SP207ESW7AKHTPRYAAD9QP8Q1TE1F57D2S8RGPJCC", "saints"];
const SBTC = ["SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"];

const source = fs.readFileSync(
  "./contracts/custodialMarket/name-nft-market-faktory.clar",
  "utf8"
);

async function main() {
  const TEMPLATE_PRINCIPAL = `${ADMIN}.${TEMPLATE_NAME}`;
  const USER_MKT_PRINCIPAL = `${ADMIN}.${USER_MKT_NAME}`; // sim limitation: USER may not have STX, so admin deploys for them
  // NOTE: in production the USER would deploy from their own wallet. For sim purposes we
  // use ADMIN to deploy both, which still proves the registration flow works since the
  // hash check is on source-code-bytes, not on tx-sender identity.

  const sessionId = await SimulationBuilder.new()
    // -----------------------------------------------------------------
    // 1. ADMIN deploys the canonical template
    // -----------------------------------------------------------------
    .withSender(ADMIN)
    .addContractDeploy({
      contract_name: TEMPLATE_NAME,
      source_code: source,
      clarity_version: ClarityVersion.Clarity4,
    })

    // -----------------------------------------------------------------
    // 2. ADMIN sets verified hash for the template (none → fetch on-chain)
    // -----------------------------------------------------------------
    .addContractCall({
      contract_id: `${CORE[0]}.${CORE[1]}`,
      function_name: "set-verified-contract",
      function_args: [principalCV(TEMPLATE_PRINCIPAL), noneCV()],
    })

    // -----------------------------------------------------------------
    // 3. USER deploys their own marketplace clone (saints-nft-market-faktory)
    //    Same source bytes — same contract-hash.
    // -----------------------------------------------------------------
    .addContractDeploy({
      contract_name: USER_MKT_NAME,
      source_code: source,
      clarity_version: ClarityVersion.Clarity4,
    })

    // -----------------------------------------------------------------
    // 4. Initialize the user's marketplace to the saints NFT contract
    // -----------------------------------------------------------------
    .addContractCall({
      contract_id: USER_MKT_PRINCIPAL,
      function_name: "initialize",
      function_args: [principalCV(`${SAINTS[0]}.${SAINTS[1]}`)],
    })

    // -----------------------------------------------------------------
    // 5. Whitelist sBTC for payments
    // -----------------------------------------------------------------
    .addContractCall({
      contract_id: USER_MKT_PRINCIPAL,
      function_name: "whitelist-ft",
      function_args: [contractPrincipalCV(SBTC[0], SBTC[1]), boolCV(true)],
    })

    // -----------------------------------------------------------------
    // 6. Self-register into fakfun-nfts-core
    //    The marketplace's register-nft-marketplace wraps the call in
    //    as-contract, so contract-caller seen by the registry is the
    //    marketplace itself. Hash check passes because source-bytes match.
    // -----------------------------------------------------------------
    .addContractCall({
      contract_id: USER_MKT_PRINCIPAL,
      function_name: "register-nft-marketplace",
      function_args: [
        principalCV(TEMPLATE_PRINCIPAL),
        stringAsciiCV("saints"),
      ],
    })

    // -----------------------------------------------------------------
    // 7. Verify registration landed
    // -----------------------------------------------------------------
    .addContractCall({
      contract_id: `${CORE[0]}.${CORE[1]}`,
      function_name: "is-marketplace-registered",
      function_args: [principalCV(USER_MKT_PRINCIPAL)],
    })
    .addContractCall({
      contract_id: `${CORE[0]}.${CORE[1]}`,
      function_name: "get-marketplace-info",
      function_args: [principalCV(USER_MKT_PRINCIPAL)],
    })

    // -----------------------------------------------------------------
    // 8. Saints holder lists token #1 through fakfun-nfts-core (the
    //    central proxy that emits the unified "nft-listed" event)
    // -----------------------------------------------------------------
    .withSender(USER) // saints #1 holder
    .addContractCall({
      contract_id: `${CORE[0]}.${CORE[1]}`,
      function_name: "list-nft",
      function_args: [
        contractPrincipalCV(ADMIN, USER_MKT_NAME),
        uintCV(1),
        contractPrincipalCV(SAINTS[0], SAINTS[1]),
        contractPrincipalCV(SBTC[0], SBTC[1]),
        uintCV(1000), // 1000 sat sBTC — arbitrary
      ],
    })

    .run();

  console.log(`\nstxer session: ${sessionId}`);
  console.log(`view:          https://stxer.xyz/simulations/mainnet/${sessionId}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
