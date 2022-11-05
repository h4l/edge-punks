# EdgePunks Image Generation Scripts

This directory contains scripts to pull all the EdgePunks' SVG and JSON metadata
from the Ethereum chain (they're stored on-chain). And to generate regular
raster images from these SVG files, both in original form and with transparent
backgrounds.

> Note: These are based on the scripts I wrote for
> [OnChainBirds](https://github.com/OnChainBirds/images/tree/main/scripts) for
> the same purpose.

The transparent versions are for use in the [PunkScape builder]. The non-1/1
EdgePunks have separate backgrounds, so their backgrounds are automatically
removed by `generate-images.mjs`. The 1/1s don't have separate backgrounds, so I
(Hal) manually removed the backgrounds. The gif versions also have animated
transparent versions, as well as static pngs.

[punkscape builder]: https://punkscape.xyz/builder

| number         | name                                | 480x480 with bg                | 480x480 without bg                                                                  |
| -------------- | ----------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| EdgePunks #26  | Jason Punk                          | [static](../480x480/26.png)    | [static](../480x480-transparent/26.png)                                             |
| EdgePunks #113 | Baphomet                            | [static](../480x480/113.png)   | [static](../480x480-transparent/113.png)                                            |
| EdgePunks #144 | The Eyes                            | [static](../480x480/144.png)   | [static](../480x480-transparent/144.png)                                            |
| EdgePunks #231 | Goated Demon                        | [static](../480x480/231.png)   | [static](../480x480-transparent/231.png)                                            |
| EdgePunks #262 | Slender Punk                        | [static](../480x480/262.png)   | [static](../480x480-transparent/262.png)                                            |
| EdgePunks #293 | Keksune                             | [static](../480x480/293.png)   | [static](../480x480-transparent/293.png)                                            |
| EdgePunks #349 | Devil Punk Ape                      | [static](../480x480/349.png)   | [static](../480x480-transparent/349.png)                                            |
| EdgePunks #380 | Dark Acolyte of the Northern Wastes | [static](../480x480/380.png)   | [static](../480x480-transparent/380.png)                                            |
| EdgePunks #411 | Medusa Punk                         | [static](../480x480/411.png)   | [static](../480x480-transparent/411.png)                                            |
| EdgePunks #498 | LaVey Punk                          | [static](../480x480/498.png)   | [static](../480x480-transparent/498.png)                                            |
| EdgePunks #529 | The Apprentice                      | [static](../480x480/529.png)   | [static](../480x480-transparent/529.png)                                            |
| EdgePunks #616 | Masked Hoodie                       | [animated](../480x480/616.gif) | [static](../480x480-transparent/616.png) [animated](../480x480-transparent/616.gif) |
| EdgePunks #647 | Illuminati Bill                     | [static](../480x480/647.png)   | [static](../480x480-transparent/647.png)                                            |
| EdgePunks #678 | Anatomy Of An Icon                  | [static](../480x480/678.png)   | [static](../480x480-transparent/678.png)                                            |
| EdgePunks #734 | OnEdgeKevin                         | [animated](../480x480/734.gif) | [static](../480x480-transparent/734.png) [animated](../480x480-transparent/734.gif) |
| EdgePunks #765 | Marina Abramovic                    | [static](../480x480/765.png)   | [static](../480x480-transparent/765.png)                                            |
| EdgePunks #796 | The Darkest Punk                    | [static](../480x480/796.png)   | [static](../480x480-transparent/796.png)                                            |
| EdgePunks #852 | Aku-Punku                           | [animated](../480x480/852.gif) | [static](../480x480-transparent/852.png) [animated](../480x480-transparent/852.gif) |
| EdgePunks #883 | Demingo                             | [static](../480x480/883.png)   | [static](../480x480-transparent/883.png)                                            |

## Usage

Before running any of these, install npm dependencies from the scripts dir:

```
$ cd scripts
# npm install
```

## SVG & JSON data

`pull-on-chain-data.mjs` fetches the EdgePunks' SVG and JSON metadata files by
executing the `tokenURI()` function of the their ERC 721 Ethereum contract,
using web3.js.

Usage example:

```console
# Define the Ethereum RPC node you want to use with this envar
$ export WEB3_RPC_URL="https://mainnet.infura.io/v3/xxxxxxxxxx"

$ npm run pull-data
```

It will fetch all SVG and JSON files, but doing so should result in no changes
to the committed versions.

## Raster images

`generate-images.mjs` generates PNG images (or GIFs for the 3 animated 1/1s) for
all EdgePunks, with a specified size, optionally without a background.

Usage example:

```console
# Re-generate everything
$ cd scripts
$ npm run regenerate-all-images
[... lots of output]

# Generate specific sizes/IDs:
# 616 is animated - transparent animated punks have both a static PNG and
# animated gif.
$ node scripts/generate-images.mjs --image-size 504 --transparent 48 113 616
3 EdgePunks to generate
504x504-transparent/113.png
504x504-transparent/48.png
504x504-transparent/616.png 504x504-transparent/616.gif

# The animated non-transparent images are only gif, not PNG.
$ node scripts/generate-images.mjs --image-size 504 48 113 616
3 EdgePunks to generate
504x504/113.png
504x504/48.png
504x504/616.gif
```

Running without any numeric IDs specified generates any non-existing images for
that size.
