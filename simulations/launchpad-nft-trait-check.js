// Launchpad trait-conformance sim
// For each candidate NFT, deploy a marketplace clone, initialize to that NFT,
// whitelist sBTC, and have a real holder list-nft. If list-nft succeeds, the
// NFT conforms to SP2PABAF...nft-trait and its transfer works as seller→contract.
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
const SBTC = ["SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"];
const LIST_PRICE = 1000; // 1000 sats sBTC — meaningless, list-nft just asserts > 0

const TESTS = [
  { mkt: "leo-cats-mkt",        nft: ["SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC", "leo-cats"],          tokenId: 5000, holder: "SP1DABD9JN312E3HG1VM3ES8RD725CBK8CE2Q5FX1" },
  { mkt: "miami-degens-mkt",    nft: ["SP1SCEXE6PMGPAC6B4N5P2MDKX8V4GF9QDE1FNNGJ", "miami-degens"],     tokenId: 50,   holder: "SP3SKH6YB515J76KVDHDHBTE2GQ4CV6QJHC5GJKRF" },
  { mkt: "drone-wars-uaps-mkt", nft: ["SP1AQ0YQEXE9VADX3TY7H1K9767ZD1KCPXAD3J489", "drone-wars-uaps"],  tokenId: 1,    holder: "SP2SBQB02XBSPKZBJW7WY5069Q455KJPQ9EET6F4H" },
  { mkt: "deruptars-mkt",       nft: ["SP2KAF9RF86PVX3NEE27DFV1CQX0T4WGR41X3S45C", "deruptars"],        tokenId: 1,    holder: "SP3WAR3N1XRR139DXCGPR1ATPK2VN63PGRXTD537N" },
  { mkt: "stacks-pops-mkt",     nft: ["SPJW1XE278YMCEYMXB8ZFGJMH8ZVAAEDP2S2PJYG", "stacks-pops"],       tokenId: 500,  holder: "SP1SKX73V3WGEW5RVK482NGT1ER0879CVXQB23FZV" },
  { mkt: "saints-mkt",          nft: ["SP207ESW7AKHTPRYAAD9QP8Q1TE1F57D2S8RGPJCC", "saints"],           tokenId: 1,    holder: "SP1HRK5ZWS3DC0KVSKK7GF32KYJ0TGDE90KXDFC3H" },
  { mkt: "early-eagles-v2-mkt", nft: ["SP35A2J9JBTPSS9WA9XZAPRX8FB3245XXG7CZ0ZM2", "early-eagles-v2"],  tokenId: 1,    holder: "SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K" },
];

const rawSource = fs.readFileSync(
  "./contracts/custodialMarket/pepe-nft-marketplace.clar",
  "utf8"
);
const source = rawSource.replace(/^;; SPV9K21[^\n]*\n/, "");

async function main() {
  let sim = SimulationBuilder.new();

  for (const t of TESTS) {
    const MKT_ID = `${DEPLOYER}.${t.mkt}`;
    sim = sim
      .withSender(DEPLOYER)
      .addContractDeploy({
        contract_name: t.mkt,
        source_code: source,
        clarity_version: ClarityVersion.Clarity4,
      })
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "initialize",
        function_args: [principalCV(`${t.nft[0]}.${t.nft[1]}`)],
      })
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "whitelist-ft",
        function_args: [contractPrincipalCV(SBTC[0], SBTC[1]), boolCV(true)],
      })
      .withSender(t.holder)
      .addContractCall({
        contract_id: MKT_ID,
        function_name: "list-nft",
        function_args: [
          uintCV(t.tokenId),
          contractPrincipalCV(t.nft[0], t.nft[1]),
          contractPrincipalCV(SBTC[0], SBTC[1]),
          uintCV(LIST_PRICE),
        ],
      });
  }

  const sessionId = await sim.run();
  console.log(`\nstxer session: ${sessionId}`);
  console.log(`view:          https://stxer.xyz/simulations/mainnet/${sessionId}\n`);

  console.log("collections sim'd (4 steps each — deploy, init, whitelist-sbtc, list-nft):");
  for (const t of TESTS) console.log(`  ${t.mkt.padEnd(25)} token #${t.tokenId} held by ${t.holder}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
