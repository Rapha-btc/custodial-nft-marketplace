import { fetchCallReadOnlyFunction, cvToJSON, uintCV } from "@stacks/transactions";

const NFT = ["SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV", "the-dawg-tails-collection"];
const owners = new Map();

for (let id = 1; id <= 26; id++) {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: NFT[0],
    contractName: NFT[1],
    functionName: "get-owner",
    functionArgs: [uintCV(id)],
    senderAddress: NFT[0],
    network: "mainnet",
  });
  const json = cvToJSON(cv);
  const owner = json?.value?.value?.value || null;
  if (owner) {
    owners.set(owner, [...(owners.get(owner) || []), id]);
  }
  process.stdout.write(`#${id}=${owner ?? "none"}\n`);
}

console.log("\n=== grouped ===");
for (const [addr, ids] of [...owners.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${addr}: [${ids.join(",")}]  (${ids.length})`);
}
