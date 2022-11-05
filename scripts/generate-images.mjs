import assert from "assert";
import fs from "fs/promises";
import path from "path";
import esMain from "es-main";
import pLimit from "p-limit";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import sharp from "sharp";

function decodeBinaryDataUrlB64(dataUrl) {
  return Buffer.from(dataUrl.split(",", 2)[1], "base64");
}

function getPngLayers(indelibleLabsSVG) {
  // Could do this "properly" by parsing the SVG XML and then the CSS attr, but
  // the structure is simple enough that some regex bodging should be fine...
  // The Indelible Labs SVG images typically contain PNG layers as multiple
  // background images on the root SVG element.
  const bgLayers = /background-image:(url\([^)]+\)(?:,url\([^)]+\))*);/.exec(
    indelibleLabsSVG
  )?.[1];
  if (!bgLayers) throw new Error("SVG does not contain the expected structure");
  return [...bgLayers.matchAll(/url\(([^)]+)\)/g)].map(([_, dataUrl]) =>
    decodeBinaryDataUrlB64(dataUrl)
  );
}

async function get1of1Meta(layerBuffers) {
  assert(layerBuffers.length > 2);
  const [top, second, ...rest] = layerBuffers;
  const meta = await sharp(top).metadata();
  const is1of1 =
    meta.width !== 192 || rest.every((layer) => second.compare(layer) === 0);
  return { is1of1, format: meta.format, width: meta.width };
}

async function indelibleLabsSvgToRaster({ svg, imageSize, transparent }) {
  const allLayers = getPngLayers(svg);
  const meta = await get1of1Meta(allLayers);
  let image;
  if (meta.is1of1) {
    if (transparent) {
      throw new Error("cannot generate transparent 1 or 1");
    }
    image = sharp(allLayers[0], { animated: meta.format === "gif" });
    image = meta.format === "gif" ? image : image.toFormat("png");
    if (imageSize !== meta.width) {
      image = image.resize({
        width: imageSize,
        kernel: "nearest",
      });
    }
  } else {
    const usedLayers = transparent ? allLayers.slice(0, -1) : allLayers;
    image = sharp(usedLayers[usedLayers.length - 1]).composite(
      usedLayers
        .slice(0, -1)
        .reverse()
        .map((buffer) => ({ input: buffer }))
    );
    if (imageSize !== meta.width) {
      // we can't resize a pipeline containing compose() because the resize is
      // applied prior to compose(), so only the base layer is resized.
      image = sharp(await image.toBuffer()).resize({
        width: imageSize,
        kernel: "nearest",
      });
    }
  }
  if (!transparent) {
    image = image.removeAlpha();
  }
  return {
    format: (await image.metadata()).format,
    image: await image.toBuffer(),
  };
}

async function svgFileToRasterFile({
  srcSvgFile,
  destFileWithoutExtension,
  imageSize,
  transparent,
}) {
  const svg = await fs.readFile(srcSvgFile, { encoding: "utf-8" });
  const { image, format } = await indelibleLabsSvgToRaster({
    svg,
    imageSize,
    transparent,
  });
  const path = `${destFileWithoutExtension}.${format}`;
  await fs.writeFile(path, image);
  return path;
}

async function main() {
  const args = yargs(hideBin(process.argv)).command(
    "$0 [token-id..]",
    "Generate PNG files from NFT SVG files.",
    (cmd) => {
      cmd.positional("token-id", {
        desc: "The token ID numbers to generate (e.g. 0 1 2). If none, generate all missing PNG files.",
        default: [],
      });
      cmd.option("image-size", {
        demandOption: true,
        number: true,
        desc: "The size of the output PNGs",
      });
      cmd.coerce("image-size", (size) => {
        if (size < 1) throw new Error("--image-size must be >= 1");
        return size;
      });
      cmd.option("transparent", {
        boolean: true,
        desc: "Make the background transparent",
      });
      cmd.option("svg-dir", {
        default: "svg",
        string: true,
      });
    }
  ).argv;
  const { tokenId, imageSize, transparent, svgDir } = args;

  const concurrency = 10;
  const throttle = pLimit(concurrency);

  const outDir = `${imageSize}x${imageSize}${
    transparent ? "-transparent" : ""
  }`;
  await fs.mkdir(outDir, { recursive: true });
  const existing = new Set(
    await (await fs.readdir(outDir))
      .filter((n) => /^\d+\.png$/.test(n))
      .map((n) => /^(\d+)/.exec(n)[1])
  );
  let missing = tokenId.length
    ? tokenId
    : [
        ...(await (await fs.readdir(svgDir))
          .filter((n) => /^\d+\.svg$/.test(n))
          .map((n) => /^(\d+)/.exec(n)[1])),
      ].filter((n) => !existing.has(n));

  console.error(`${missing.length} Images to generate`);
  let error = false;

  const generate = async (tokenId) => {
    const srcSvgFile = path.join(svgDir, `${tokenId}.svg`);
    const destFileWithoutExtension = path.join(outDir, `${tokenId}`);
    try {
      const path = await svgFileToRasterFile({
        srcSvgFile,
        destFileWithoutExtension,
        imageSize,
        transparent,
      });
      console.error(path);
    } catch (e) {
      error = true;
      console.error(`Failed to generate image for token ID ${tokenId}:`, e);
    }
  };

  try {
    await await Promise.all(
      missing.map((tokenId) => throttle(() => generate(tokenId)))
    );
  } finally {
    process.exitCode = error;
  }
}

if (esMain(import.meta)) {
  main().catch((e) => {
    console.error(e);
  });
}
