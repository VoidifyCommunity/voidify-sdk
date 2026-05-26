# Voidify SDK

[English](README.md) | [中文](docs/README.zh-CN.md) | [Русский](docs/README.ru.md) | [日本語](docs/README.ja.md)

`@voidifydao/sdk` is the Voidify SDK and CLI for deposits, private notes, relayer withdrawals, relayer services, and indexed protocol activity on Solana.

## Install

As a library:

```sh
npm install @voidifydao/sdk
```

As a command-line tool:

```sh
npm install -g @voidifydao/sdk
voidify --help
```

## CLI Setup

Generate a JSON configuration file, then fill in that same file:

```sh
voidify config init --type default --path ./voidify.json
voidify -c ./voidify.json config set programId YOUR_VOIDIFY_PROGRAM_ID
voidify -c ./voidify.json config set keypair.path /absolute/path/to/solana-keypair.json
```

For withdrawal proof generation, download the proof artifacts from the
[Voidify ceremony record v1.0.0 release](https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/tag/v1.0.0).
Extract `withdraw.wasm` and `withdraw.zkey`, then place them at the
`proof.wasmPath` and `proof.zkeyPath` paths in the generated config.

All following commands use the generated `./voidify.json` file through `-c`.

## CLI Commands

Generate a private note:

```sh
voidify -c ./voidify.json note gen 1
```

Deposit `1 SOL`. If `--commitment` is omitted, a new note is generated and printed:

```sh
voidify -c ./voidify.json deposit 1
```

List deposits in a pool:

```sh
voidify -c ./voidify.json deposit list 1
```

Withdraw through an automatically selected healthy relayer:

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS
```

Choose a relayer by name:

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS --relayer RELAYER_NAME
```

> Keep your private note secure. Anyone with the note can withdraw the deposit, and a lost note cannot be recovered.

## Run a Relayer

Generate a relayer JSON configuration, fill in that file, then use it for relayer commands:

```sh
voidify config init --type relayer --path ./relayer.json
voidify -c ./relayer.json relayer start
```

## SDK Usage

```ts
import { Context, Note, voidify } from "@voidifydao/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";

const wallet = Keypair.generate();
const ctx = new Context({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  programId: new PublicKey("YOUR_VOIDIFY_PROGRAM_ID"),
  wallet,
});

const note = await Note.generate("1");
const signature = await voidify.deposit(
  ctx,
  note.commitment,
  1_000_000_000n,
);

console.log(note.serialize(), signature);
```

The package also exports withdrawal helpers, relayer types, `VoidifyProgram`, substream clients and stores, and amount/note utilities.
