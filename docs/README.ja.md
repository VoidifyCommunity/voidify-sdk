# @voidifydao/sdk

[English](../README.md) | [中文](README.zh-CN.md) | [Русский](README.ru.md) | [日本語](README.ja.md)

Voidify Solana プログラムとやり取りするための TypeScript SDK と CLI です。

このパッケージには次が含まれます。

- Voidify PDA の導出と Anchor instruction の構築に使う program client；
- deposit と withdrawal の helper；
- note の生成と検証ユーティリティ；
- ユーザーと operator 向け CLI；
- deposit と relayer event indexing 用の local/remote substream clients；
- relayers と substream indexing 用の HTTP services。

## インストール

```bash
npm install @voidifydao/sdk
```

このパッケージは ESM-only で、modern Node.js runtime を対象にしています。

## CLI

このパッケージは `voidify` binary を提供します。

グローバルインストールせずに使う場合：

```bash
npx @voidifydao/sdk --help
```

`-g` でグローバルインストールすると、`voidify` を直接実行できます。

```bash
npm install -g @voidifydao/sdk
voidify --help
```

推奨フローは、まず 1 つの config file を作成して一度だけ入力し、その後すべての command で `-c` にその config を渡す形です。

### 1. Config を作成する

```bash
voidify config init --type default --path ./voidify-config.json
```

このチュートリアルでは、config を現在のフォルダに `./voidify-config.json` として生成します。`--path` を省略した場合、CLI は platform-specific な default config path を使用します。

User config の例：

```json
{
  "rpcUrl": "https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>",
  "programId": "<VOIDIFY_PROGRAM_ID>",
  "keypair": {
    "type": "file",
    "path": "/absolute/path/to/solana-keypair.json"
  },
  "substream": {
    "type": "auto",
    "url": "https://substream.voidifycto.com",
    "dbPath": "./substream.db"
  },
  "proof": {
    "wasmPath": "./withdraw.wasm",
    "zkeyPath": "./withdraw.zkey"
  }
}
```

`programId` は on-chain operations に必要です。`proof.wasmPath` と `proof.zkeyPath` は withdrawal proof generation に必要です。

Voidify ceremony record release から proof artifacts をダウンロードし、現在のフォルダに展開します。

```bash
curl -L -o withdraw.zip https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/download/v1.0.0/withdraw.zip
unzip withdraw.zip
```

展開後、config の paths は次を指す必要があります。

```json
"proof": {
  "wasmPath": "./withdraw.wasm",
  "zkeyPath": "./withdraw.zkey"
}
```

Config value の確認や変更にも同じ `-c` を使います。

```bash
voidify -c ./voidify-config.json config get rpcUrl
voidify -c ./voidify-config.json config set rpcUrl '"https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"'
```


### 2. 自分の RPC URL を追加する

CLI を使う前に、自分の Solana RPC endpoint を作成してください。[Helius](https://www.helius.dev/) に登録し、API key を作成して、生成された RPC URL を `./voidify-config.json` に入れます。

```json
"rpcUrl": "https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"
```

### 3. 以降すべての Command でこの Config を使う

```bash
voidify -c ./voidify-config.json note gen 1
voidify -c ./voidify-config.json note verify <note> <commitment>

voidify -c ./voidify-config.json deposit 1
voidify -c ./voidify-config.json deposit 1 --commitment <commitment>
voidify -c ./voidify-config.json deposit list 1 --limit 50

voidify -c ./voidify-config.json withdraw <note> --recipient <recipient_pubkey>
voidify -c ./voidify-config.json withdraw <note> --relayer <relayer_name>

voidify -c ./voidify-config.json relayer list
voidify -c ./voidify-config.json relayer start

voidify -c ./voidify-config.json substream
```

## SDK の使い方

### Context を作成する

```ts
import { Context, makeIndexedDBStores } from "@voidifydao/sdk";
import { PublicKey } from "@solana/web3.js";

const programId = new PublicKey("<VOIDIFY_PROGRAM_ID>");

const ctx = new Context({
  rpcUrl: "https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>",
  programId,
  wallet: walletAdapter,
  substream: {
    type: "remote",
    url: "https://substream.voidifycto.com",
    makeRepos: () => makeIndexedDBStores("voidify-substream")
  },
  wasmPath: "/withdraw.wasm",
  zkeyPath: "/withdraw.zkey"
});
```

### Note を生成する

```ts
import { Note } from "@voidifydao/sdk";

const note = await Note.generate("1");

console.log(note.serialize());
console.log(note.commitment);
```

Note は withdrawal secret です。Voidify は紛失した note を復元できず、note を持つ人は誰でも対応する deposit を withdraw できます。

### Deposit

```ts
import { Note, voidify, parseUnits } from "@voidifydao/sdk";

const note = await Note.generate("1");

const signature = await voidify.deposit(
  ctx,
  note.commitment,
  parseUnits("1", 9)
);

console.log({ signature, note: note.serialize() });
```

### Deposit を一覧する

```ts
import { voidify, parseUnits } from "@voidifydao/sdk";

const deposits = await voidify.listDeposits(ctx, parseUnits("1", 9), {
  limit: 50
});

console.log(deposits);
```

### Relayer 経由で Withdraw する

```ts
import { voidify } from "@voidifydao/sdk";

const signature = await voidify.withdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);

console.log(signature);
```

特定の relayer を名前で選ぶ場合：

```ts
const signature = await voidify.withdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>",
  "<relayer_name>"
);
```

### Withdrawal を準備して別途送信する

```ts
import { voidify } from "@voidifydao/sdk";

const artifact = await voidify.prepareWithdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);

const signature = await voidify.submitWithdrawToRelayer(artifact);
```

### Direct Withdraw

```ts
import { voidify } from "@voidifydao/sdk";

const signature = await voidify.directWithdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);
```

Direct withdrawals は呼び出し元 wallet によって署名され、withdrawal wallet が on-chain で露出する可能性があります。Withdrawal privacy を守る場合は relayer withdrawals がデフォルトです。

## Program Helpers

Deterministic PDA または underlying Anchor program へのアクセスが必要な場合は、`VoidifyProgram` を使用します。

```ts
import { VoidifyProgram } from "@voidifydao/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const client = new VoidifyProgram(
  new Connection("https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"),
  new PublicKey("<VOIDIFY_PROGRAM_ID>")
);

const pool = client.pool(1_000_000_000n);
const treasury = client.treasury();
```

利用可能な PDA helpers：

- `stakeConfig()`
- `treasuryConfig()`
- `oracleConfig()`
- `pool(denomination)`
- `treasury()`
- `commitment(commitmentBytes)`
- `nullifier(nullifierHashBytes)`
- `relayerConfig(relayerPubkey)`
- `relayerEventCounter()`

## Relayer Service

Relayer config を作成します。

```bash
voidify config init --type relayer --path ./voidify.relayer.config.json
```

Config には次が必要です。

- `rpcUrl`
- `programId`
- `keypair`
- `relayerServer.port`
- `relayerServer.host`
- `relayerServer.feedId`

Service を起動します。

```bash
voidify -c ./voidify.relayer.config.json relayer start
```

Relayer は次を公開します。

- `GET /health`
- `POST /api/relay/withdraw`

## Substream Service

Substream server config を作成します。

```bash
voidify config init --type substream --path ./voidify.substream.config.json
```

Service を起動します。

```bash
voidify -c ./voidify.substream.config.json substream
```

CLI と SDK は substream data を 3 つの mode で利用できます。

- `remote`：remote substream service から events を読み取る；
- `local`：local SQLite database を使って読み取りと sync を行う；
- `auto`：remote service を使い、local caching も行う。

## Exports

主な exports：

- `Context`
- `VoidifyProgram`
- `voidify`
- `Note`
- `parseUnits`
- `formatUnits`
- `toBN`
- `SubstreamCliClient`
- `makeIndexedDBStores`

Deposit、relayer、event、substream、withdrawal response 関連の types も package root から export されます。

## 開発

```bash
npm install
npm run build
npm run dev -- --help
```

`npm run build` は TypeScript compilation と `tsc-alias` による alias rewriting を実行します。

## セキュリティ注意事項

- Voidify note を絶対に共有しないでください。
- Keypairs を公開 repository に置かないでください。
- User、relayer、substream の role ごとに別々の keypair/config file を使用してください。
- Withdrawal privacy が重要な場合は relayer withdrawals を優先してください。
- Production 使用前に `programId`、RPC endpoints、relayer endpoints、proof artifacts を検証してください。
