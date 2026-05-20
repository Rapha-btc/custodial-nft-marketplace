// Launchpad full-flow sim: for each of 7 candidate NFTs, deploy a marketplace clone,
// initialize to that NFT, whitelist PEPE as payment, have the real holder list a token
// they own, then have a PEPE-rich buyer purchase it. Proves trait conformance + transfer
// + FT payment splits + NFT custody return all work end-to-end.
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  boolCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const BUYER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2"; // ~421M PEPE on mainnet
const PEPE = ["SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275", "tokensoft-token-v4k68639zxz"];
const LIST_PRICE = 10_000_000_000; // 10M PEPE (3 decimals → ×1000)

const TESTS = [
  { mkt: "leo-cats-mkt",        nft: ["SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC", "leo-cats"],          tokenId: 5000, holder: "SP1DABD9JN312E3HG1VM3ES8RD725CBK8CE2Q5FX1" },
  { mkt: "miami-degens-mkt",    nft: ["SP1SCEXE6PMGPAC6B4N5P2MDKX8V4GF9QDE1FNNGJ", "miami-degens"],     tokenId: 50,   holder: "SP3SKH6YB515J76KVDHDHBTE2GQ4CV6QJHC5GJKRF" },
  { mkt: "drone-wars-uaps-mkt", nft: ["SP1AQ0YQEXE9VADX3TY7H1K9767ZD1KCPXAD3J489", "drone-wars-uaps"],  tokenId: 1,    holder: "SP2SBQB02XBSPKZBJW7WY5069Q455KJPQ9EET6F4H" },
  { mkt: "deruptars-mkt",       nft: ["SP2KAF9RF86PVX3NEE27DFV1CQX0T4WGR41X3S45C", "deruptars"],        tokenId: 1,    holder: "SP3WAR3N1XRR139DXCGPR1ATPK2VN63PGRXTD537N" },
  { mkt: "stacks-pops-mkt",     nft: ["SPJW1XE278YMCEYMXB8ZFGJMH8ZVAAEDP2S2PJYG", "stacks-pops"],       tokenId: 500,  holder: "SP1SKX73V3WGEW5RVK482NGT1ER0879CVXQB23FZV" },
  { mkt: "saints-mkt",          nft: ["SP207ESW7AKHTPRYAAD9QP8Q1TE1F57D2S8RGPJCC", "saints"],           tokenId: 1,    holder: "SP1HRK5ZWS3DC0KVSKK7GF32KYJ0TGDE90KXDFC3H" },
  { mkt: "early-eagles-v2-mkt", nft: ["SP35A2J9JBTPSS9WA9XZAPRX8FB3245XXG7CZ0ZM2", "early-eagles-v2"],  tokenId: 1,    holder: "SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K" },
];

const source = fs.readFileSync(
  "./contracts/custodialMarket/name-nft-market-faktory.clar",
  "utf8"
);

async function main() {
  let sim = SimulationBuilder.new();

  for (const t of TESTS) {
    const MKT_ID = `${DEPLOYER}.${t.mkt}`;
    sim = sim
      // 1. ADMIN deploys marketplace clone
      .withSender(DEPLOYER)
      .addContractDeploy({
        contract_name: t.mkt,
        source_code: source,
        clarity_version: ClarityVersion.Clarity4,
      })
      // 2. ADMIN initializes marketplace to this NFT
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "initialize",
        function_args: [principalCV(`${t.nft[0]}.${t.nft[1]}`)],
      })
      // 3. ADMIN whitelists PEPE as the payment FT
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "whitelist-ft",
        function_args: [contractPrincipalCV(PEPE[0], PEPE[1]), boolCV(true)],
      })
      // 4. Real holder lists their token at 10M PEPE
      .withSender(t.holder)
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "list-nft",
        function_args: [
          uintCV(t.tokenId),
          contractPrincipalCV(t.nft[0], t.nft[1]),
          contractPrincipalCV(PEPE[0], PEPE[1]),
          uintCV(LIST_PRICE),
        ],
      })
      // 5. PEPE-rich buyer purchases the token
      .withSender(BUYER)
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "buy-nft",
        function_args: [
          uintCV(t.tokenId),
          contractPrincipalCV(t.nft[0], t.nft[1]),
          contractPrincipalCV(PEPE[0], PEPE[1]),
        ],
      });
  }

  const sessionId = await sim.run();
  console.log(`\nstxer session: ${sessionId}`);
  console.log(`view:          https://stxer.xyz/simulations/mainnet/${sessionId}\n`);
  console.log("flow per collection (5 steps): deploy, initialize, whitelist-PEPE, list-nft, buy-nft");
}

main().catch((e) => { console.error(e); process.exit(1); });
