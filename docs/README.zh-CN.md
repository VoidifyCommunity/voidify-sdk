# Voidify SDK

[English](../README.md) | [中文](README.zh-CN.md) | [Русский](README.ru.md) | [日本語](README.ja.md)

`@voidifydao/sdk` 是 Voidify 在 Solana 上用于存款、私密 note、relayer 提款、relayer 服务和索引协议活动的 SDK 与 CLI。

## 安装

作为代码库使用：

```sh
npm install @voidifydao/sdk
```

作为命令行工具使用：

```sh
npm install -g @voidifydao/sdk
voidify --help
```

## CLI 配置

生成 JSON 配置文件，然后在同一文件中填写所需配置：

```sh
voidify config init --type default --path ./voidify.json
voidify -c ./voidify.json config set programId YOUR_VOIDIFY_PROGRAM_ID
voidify -c ./voidify.json config set keypair.path /absolute/path/to/solana-keypair.json
```

生成提款证明前，请从
[Voidify ceremony record v1.0.0 Release](https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/tag/v1.0.0)
下载证明文件。解压得到 `withdraw.wasm` 和 `withdraw.zkey` 后，将它们放置在
生成配置中的 `proof.wasmPath` 与 `proof.zkeyPath` 路径。

以下所有命令均通过 `-c` 使用已生成的 `./voidify.json` 文件。

## CLI 命令

生成私密 note：

```sh
voidify -c ./voidify.json note gen 1
```

存入 `1 SOL`。如果未提供 `--commitment`，命令会生成并输出新的 note：

```sh
voidify -c ./voidify.json deposit 1
```

查看池中存款：

```sh
voidify -c ./voidify.json deposit list 1
```

通过自动选择的健康 relayer 提款：

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS
```

按名称选择 relayer：

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS --relayer RELAYER_NAME
```

> 请安全保存私密 note。任何拥有 note 的人都可以领取该笔存款，遗失的 note 无法找回。

## 运行 Relayer

生成 relayer JSON 配置文件，在文件中填写必填项，然后用它执行 relayer 命令：

```sh
voidify config init --type relayer --path ./relayer.json
voidify -c ./relayer.json relayer start
```

## SDK 使用

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

该包还导出提款工具、relayer 类型、`VoidifyProgram`、substream 客户端和存储，以及金额与 note 工具函数。
