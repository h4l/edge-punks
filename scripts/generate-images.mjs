import assert from "assert";
import esMain from "es-main";
import fs from "fs/promises";
import path from "path";
import pLimit from "p-limit";
import sharp from "sharp";
import { fileURLToPath } from "url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const MAX_SUPPLY = 888;

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

async function indelibleLabsSvgToRaster({
  tokenId,
  svg,
  imageSize,
  transparent,
}) {
  const allLayers = getPngLayers(svg);
  const meta = await get1of1Meta(allLayers);

  if (meta.is1of1) {
    if (transparent) {
      if (imageSize === 24) {
        console.error(
          `Warning: not generating ${tokenId}: Cannot re-generate manually-created 1/1 24x24-transparent images`
        );
        return [];
      }
      // I manually-created the transparent 1/1s because they don't have
      // separate backgrounds in the source SVG images. So we create other sizes
      // by just scaling the 24x24-transparent image, which is the 1px:1px size.
      const images = [
        sharp(
          await fs.readFile(
            path.resolve(
              fileURLToPath(import.meta.url),
              `../../24x24-transparent/${tokenId}.png`
            )
          )
        ),
      ];

      // GIF 1/1s have two transparent versions - static PNG and animated GIF.
      if (meta.format === "gif") {
        images.push(
          sharp(
            await fs.readFile(
              path.resolve(
                fileURLToPath(import.meta.url),
                `../../24x24-transparent/${tokenId}.gif`
              )
            ),
            { animated: true }
          )
        );
      }
      return images.map((i) => resize(i, imageSize));
    } else {
      let image = sharp(allLayers[0], { animated: meta.format === "gif" });
      if (meta.format !== "gif") {
        image = image.toFormat("png").removeAlpha();
      }
      if (imageSize !== meta.width) {
        image = resize(image, imageSize);
      }
      return [image];
    }
  } else {
    const usedLayers = transparent ? allLayers.slice(0, -1) : allLayers;
    let image = sharp(usedLayers[usedLayers.length - 1]).composite(
      usedLayers
        .slice(0, -1)
        .reverse()
        .map((buffer) => ({ input: buffer }))
    );
    if (imageSize !== meta.width) {
      // we can't resize a pipeline containing compose() because the resize is
      // applied prior to compose(), resulting in only the base layer being
      // resized. So instead we have finalise the composition before resizing.
      image = resize(sharp(await image.toBuffer()), imageSize);
    }
    if (!transparent) {
      image = image.removeAlpha();
    }
    return [image];
  }
}

function resize(image, imageSize) {
  return image.resize({
    width: imageSize,
    kernel: "nearest",
  });
}

async function svgFileToRasterFile({
  tokenId,
  srcSvgFile,
  destFileWithoutExtension,
  imageSize,
  transparent,
}) {
  const svg = await fs.readFile(srcSvgFile, { encoding: "utf-8" });
  const images = await indelibleLabsSvgToRaster({
    tokenId,
    svg,
    imageSize,
    transparent,
  });
  const paths = await Promise.all(
    images.map(async (image) => {
      const format = (await image.metadata()).format;
      const buf = await image.toBuffer();
      const path = `${destFileWithoutExtension}.${format}`;
      fs.writeFile(path, buf);
      return path;
    })
  );
  return paths;
}

async function main() {
  const args = yargs(hideBin(process.argv)).command(
    "$0 [token-id..]",
    "Generate PNG files from NFT SVG files.",
    (cmd) => {
      cmd.positional("token-id", {
        desc: "The token ID numbers to generate (e.g. 0 1 2). Otherwise, generate all image files.",
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
  let ids = tokenId.length ? tokenId : [...Array(MAX_SUPPLY).keys()];

  console.error(`${ids.length} EdgePunks to generate`);
  let error = false;

  const generate = async (tokenId) => {
    const srcSvgFile = path.join(svgDir, `${tokenId}.svg`);
    const destFileWithoutExtension = path.join(outDir, `${tokenId}`);
    try {
      const paths = await svgFileToRasterFile({
        tokenId,
        srcSvgFile,
        destFileWithoutExtension,
        imageSize,
        transparent,
      });
      console.error(paths.join(" "));
    } catch (e) {
      error = true;
      console.error(`Failed to generate image for token ID ${tokenId}:`, e);
    }
  };

  try {
    await await Promise.all(
      ids.map((tokenId) => throttle(() => generate(tokenId)))
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
