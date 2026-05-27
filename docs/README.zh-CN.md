# @voidifydao/sdk

[English](../README.md) | [中文](README.zh-CN.md) | [Русский](README.ru.md) | [日本語](README.ja.md)

用于与 Voidify Solana 程序交互的 TypeScript SDK 和 CLI。

该包包含：

- 用于派生 Voidify PDA 和构建 Anchor 指令的程序客户端；
- 存款和提款辅助函数；
- note 生成与验证工具；
- 面向用户和运营者的 CLI；
- 用于存款和 relayer 事件索引的本地/远程 substream 客户端；
- relayer 和 substream 索引 HTTP 服务。

## 安装

```bash
npm install @voidifydao/sdk
```

该包仅支持 ESM，并面向现代 Node.js 运行时。

## CLI

该包暴露 `voidify` 命令。

不全局安装时，可以这样用：

```bash
npx @voidifydao/sdk --help
```

也可以用 `-g` 全局安装，然后直接运行 `voidify`：

```bash
npm install -g @voidifydao/sdk
voidify --help
```

推荐流程是：先生成一个 config，填好一次，之后每条命令都用 `-c` 指向这个 config。

### 1. 生成 Config

```bash
voidify config init --type default --path ./voidify-config.json
```

本教程把 config 生成到当前文件夹：`./voidify-config.json`。如果省略 `--path`，CLI 会使用平台默认配置路径。

用户配置示例：

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

`programId` 是链上操作必需项。`proof.wasmPath` 和 `proof.zkeyPath` 是提款证明生成必需项。

从 Voidify ceremony record release 下载 proof artifacts，并解压到当前文件夹：

```bash
curl -L -o withdraw.zip https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/download/v1.0.0/withdraw.zip
unzip withdraw.zip
```

解压后，config 里的路径应指向：

```json
"proof": {
  "wasmPath": "./withdraw.wasm",
  "zkeyPath": "./withdraw.zkey"
}
```

读取或修改配置时，也使用同一个 `-c`：

```bash
voidify -c ./voidify-config.json config get rpcUrl
voidify -c ./voidify-config.json config set rpcUrl '"https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"'
```


### 2. 添加你自己的 RPC URL

使用 CLI 前，先创建自己的 Solana RPC endpoint。你可以去 [Helius](https://www.helius.dev/) 注册，创建 API key，然后把生成的 RPC URL 填到 `./voidify-config.json`：

```json
"rpcUrl": "https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"
```

### 3. 后续所有命令都使用这个 Config

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

## SDK 用法

### 创建 Context

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

### 生成 Note

```ts
import { Note } from "@voidifydao/sdk";

const note = await Note.generate("1");

console.log(note.serialize());
console.log(note.commitment);
```

Note 是提款密钥。Voidify 无法恢复丢失的 note，任何持有 note 的人都可以提取对应存款。

### 存款

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

### 查询存款

```ts
import { voidify, parseUnits } from "@voidifydao/sdk";

const deposits = await voidify.listDeposits(ctx, parseUnits("1", 9), {
  limit: 50
});

console.log(deposits);
```

### 通过 Relayer 提款

```ts
import { voidify } from "@voidifydao/sdk";

const signature = await voidify.withdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);

console.log(signature);
```

指定 relayer 名称：

```ts
const signature = await voidify.withdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>",
  "<relayer_name>"
);
```

### 分离准备和提交提款

```ts
import { voidify } from "@voidifydao/sdk";

const artifact = await voidify.prepareWithdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);

const signature = await voidify.submitWithdrawToRelayer(artifact);
```

### 直接提款

```ts
import { voidify } from "@voidifydao/sdk";

const signature = await voidify.directWithdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);
```

直接提款由调用者钱包签名，可能在链上暴露提款钱包。需要保护提款隐私时，默认应使用 relayer 提款。

## 程序辅助工具

需要确定性 PDA 或访问底层 Anchor program 时，使用 `VoidifyProgram`。

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

可用 PDA helpers：

- `stakeConfig()`
- `treasuryConfig()`
- `oracleConfig()`
- `pool(denomination)`
- `treasury()`
- `commitment(commitmentBytes)`
- `nullifier(nullifierHashBytes)`
- `relayerConfig(relayerPubkey)`
- `relayerEventCounter()`

## Relayer 服务

创建 relayer 配置：

```bash
voidify config init --type relayer --path ./voidify.relayer.config.json
```

配置必须包含：

- `rpcUrl`
- `programId`
- `keypair`
- `relayerServer.port`
- `relayerServer.host`
- `relayerServer.feedId`

启动服务：

```bash
voidify -c ./voidify.relayer.config.json relayer start
```

Relayer 暴露：

- `GET /health`
- `POST /api/relay/withdraw`

## Substream 服务

创建 substream server 配置：

```bash
voidify config init --type substream --path ./voidify.substream.config.json
```

启动服务：

```bash
voidify -c ./voidify.substream.config.json substream
```

CLI 和 SDK 可用三种 substream 数据模式：

- `remote`：读取远程 substream 服务；
- `local`：使用本地 SQLite 数据库读取并同步；
- `auto`：使用远程服务并进行本地缓存。

## 导出

主要导出：

- `Context`
- `VoidifyProgram`
- `voidify`
- `Note`
- `parseUnits`
- `formatUnits`
- `toBN`
- `SubstreamCliClient`
- `makeIndexedDBStores`

包根路径也导出存款、relayer、事件、substream 和提款响应相关类型。

## 开发

```bash
npm install
npm run build
npm run dev -- --help
```

`npm run build` 会运行 TypeScript 编译，并通过 `tsc-alias` 重写路径别名。

## 安全注意事项

- 永远不要分享 Voidify note。
- 不要把 keypairs 放进公开仓库。
- 为用户、relayer、substream 角色使用不同 keypair/config 文件。
- 需要保护提款隐私时，优先使用 relayer 提款。
- 生产使用前验证 `programId`、RPC endpoint、relayer endpoint 和 proof artifacts。
