# Voidify SDK

[English](../README.md) | [中文](README.zh-CN.md) | [Русский](README.ru.md) | [日本語](README.ja.md)

`@voidifydao/sdk` は、Solana 上の預入、秘密の note、relayer 経由の出金、relayer サービス、インデックス済みプロトコルアクティビティのための Voidify SDK と CLI です。

## インストール

ライブラリとして使用する場合：

```sh
npm install @voidifydao/sdk
```

コマンドラインツールとして使用する場合：

```sh
npm install -g @voidifydao/sdk
voidify --help
```

## CLI の設定

JSON 設定ファイルを生成し、同じファイルに必要な設定を入力します。

```sh
voidify config init --type default --path ./voidify.json
voidify -c ./voidify.json config set programId YOUR_VOIDIFY_PROGRAM_ID
voidify -c ./voidify.json config set keypair.path /absolute/path/to/solana-keypair.json
```

出金証明を生成する前に、
[Voidify ceremony record v1.0.0 Release](https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/tag/v1.0.0)
から証明アーティファクトをダウンロードしてください。`withdraw.wasm` と
`withdraw.zkey` を展開し、生成された設定内の `proof.wasmPath` と
`proof.zkeyPath` の場所に配置します。

以下のすべてのコマンドは、`-c` を通じて生成済みの `./voidify.json` ファイルを使用します。

## CLI コマンド

秘密の note を生成します。

```sh
voidify -c ./voidify.json note gen 1
```

`1 SOL` を預け入れます。`--commitment` を指定しない場合、新しい note が生成され表示されます。

```sh
voidify -c ./voidify.json deposit 1
```

プール内の預入を一覧表示します。

```sh
voidify -c ./voidify.json deposit list 1
```

自動選択された正常な relayer を通じて出金します。

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS
```

名前で relayer を選択します。

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS --relayer RELAYER_NAME
```

> 秘密の note は安全に保管してください。Note を持つ人は誰でも預入を引き出すことができ、紛失した note を復元することはできません。

## Relayer の起動

Relayer 用 JSON 設定を生成し、必須値を入力して、そのファイルを relayer コマンドで使用します。

```sh
voidify config init --type relayer --path ./relayer.json
voidify -c ./relayer.json relayer start
```

## SDK の使用

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

このパッケージは、出金ヘルパー、relayer 型、`VoidifyProgram`、substream クライアントとストア、および金額と note のユーティリティもエクスポートします。
