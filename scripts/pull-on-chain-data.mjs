import Web3 from "web3";
import pLimit from "p-limit";
import fs from "fs/promises";
import path from "path";
import esMain from "es-main";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const OCB_CONTRACT = "0x83921cb2bdfe8f70aa2988a20dd8b91c197b04b9";
const MAX_SUPPLY = 888;
const ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "tokenURI",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

function decodeDataUrlText(dataUrl) {
  return Buffer.from(dataUrl.split(",", 2)[1], "base64").toString("utf-8");
}

async function getOnChainErc721Meta(contract, tokenId) {
  const metaUrl = await contract.methods.tokenURI(tokenId).call({ gas: 300e6 });
  return JSON.parse(decodeDataUrlText(metaUrl));
}

function getIndelibleLabsSvg(metadata) {
  // indelible labs metadata doesn't use the image property to specify its image
  return decodeDataUrlText(metadata.svg_image_data);
}

function getNonImageMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([k]) => !k.includes("image"))
  );
}

async function main() {
  const args = yargs(hideBin(process.argv)).command(
    "$0 [token-id..]",
    "Generate PNG files from NFT SVG files.",
    (cmd) => {
      cmd.positional("token-id", {
        desc: "The token ID numbers to pull (e.g. 0 1 2). If none, pull IDs.",
        default: [],
      });
    }
  ).argv;

  if (!process.env.WEB3_RPC_URL)
    throw new Error("WEB3_RPC_URL environment variable is not set");
  const web3 = new Web3(
    new Web3.providers.HttpProvider(process.env.WEB3_RPC_URL)
  );
  const contract = new web3.eth.Contract(ABI, OCB_CONTRACT);
  const throttle = pLimit(10);

  let error = false;
  async function fetchAndWriteData(tokenId) {
    const svgFile = path.join("svg", `${tokenId}.svg`);
    const metadataFile = path.join("metadata", `${tokenId}.json`);
    try {
      console.log(svgFile, metadataFile);
      const meta = await getOnChainErc721Meta(contract, tokenId);
      await Promise.all([
        fs.writeFile(svgFile, getIndelibleLabsSvg(meta)),
        fs.writeFile(metadataFile, JSON.stringify(getNonImageMetadata(meta))),
      ]);
    } catch (e) {
      error = true;
      console.error(`error: failed to generate & save ${tokenId}: ${e}`);
      throw e;
    }
  }

  await fs.mkdir("svg", { recursive: true });
  await fs.mkdir("metadata", { recursive: true });
  const ids = args.tokenId.length
    ? args.tokenId
    : [...Array(MAX_SUPPLY).keys()];

  console.error(`${ids.length} tokens to pull`);
  await Promise.all(ids.map((n) => throttle(() => fetchAndWriteData(n))));
  process.exitCode = error;
}

if (esMain(import.meta)) {
  main().catch((e) => {
    console.error(e);
  });
}
