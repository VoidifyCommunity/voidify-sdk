# @voidifydao/sdk

[English](../README.md) | [中文](README.zh-CN.md) | [Русский](README.ru.md) | [日本語](README.ja.md)

TypeScript SDK и CLI для взаимодействия с Solana-программой Voidify.

Пакет включает:

- клиент программы для вывода Voidify PDA и построения Anchor-инструкций;
- helpers для депозитов и выводов;
- утилиты генерации и проверки note;
- CLI для пользователей и операторов;
- локальные/удаленные substream-клиенты для индексации событий deposit и relayer;
- HTTP-сервисы для relayers и substream-индексации.

## Установка

```bash
npm install @voidifydao/sdk
```

Пакет поддерживает только ESM и рассчитан на современные версии Node.js.

## CLI

Пакет предоставляет binary `voidify`.

Можно использовать без глобальной установки:

```bash
npx @voidifydao/sdk --help
```

Или установить глобально через `-g`, а затем запускать `voidify` напрямую:

```bash
npm install -g @voidifydao/sdk
voidify --help
```

Рекомендуемый поток: создать один config file, заполнить его один раз, а затем передавать его через `-c` в каждой команде.

### 1. Создайте Config

```bash
voidify config init --type default --path ./voidify-config.json
```

В этом руководстве config создается в текущей папке как `./voidify-config.json`. Если `--path` не указан, CLI использует платформенный путь по умолчанию.

Пример пользовательского конфига:

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

`programId` требуется для ончейн-операций. `proof.wasmPath` и `proof.zkeyPath` требуются для генерации доказательства вывода.

Скачайте proof artifacts из release Voidify ceremony record и распакуйте их в текущую папку:

```bash
curl -L -o withdraw.zip https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/download/v1.0.0/withdraw.zip
unzip withdraw.zip
```

После распаковки paths в config должны указывать на:

```json
"proof": {
  "wasmPath": "./withdraw.wasm",
  "zkeyPath": "./withdraw.zkey"
}
```

Просматривать и изменять config values можно с тем же флагом `-c`:

```bash
voidify -c ./voidify-config.json config get rpcUrl
voidify -c ./voidify-config.json config set rpcUrl '"https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"'
```


### 2. Добавьте свой RPC URL

Перед использованием CLI создайте собственный Solana RPC endpoint. Можно зарегистрироваться на [Helius](https://www.helius.dev/), создать API key и вставить полученный RPC URL в `./voidify-config.json`:

```json
"rpcUrl": "https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>"
```

### 3. Используйте Config для каждой следующей команды

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

## Использование SDK

### Создание Context

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

### Генерация Note

```ts
import { Note } from "@voidifydao/sdk";

const note = await Note.generate("1");

console.log(note.serialize());
console.log(note.commitment);
```

Note является секретом для вывода. Voidify не может восстановить потерянную note, а любой, кто владеет note, может вывести соответствующий депозит.

### Депозит

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

### Список депозитов

```ts
import { voidify, parseUnits } from "@voidifydao/sdk";

const deposits = await voidify.listDeposits(ctx, parseUnits("1", 9), {
  limit: 50
});

console.log(deposits);
```

### Вывод через Relayer

```ts
import { voidify } from "@voidifydao/sdk";

const signature = await voidify.withdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);

console.log(signature);
```

Чтобы выбрать relayer по имени:

```ts
const signature = await voidify.withdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>",
  "<relayer_name>"
);
```

### Отдельная подготовка и отправка вывода

```ts
import { voidify } from "@voidifydao/sdk";

const artifact = await voidify.prepareWithdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);

const signature = await voidify.submitWithdrawToRelayer(artifact);
```

### Прямой вывод

```ts
import { voidify } from "@voidifydao/sdk";

const signature = await voidify.directWithdraw(
  ctx,
  "<voidify-note>",
  "<recipient_pubkey>"
);
```

Прямой вывод подписывается кошельком вызывающего пользователя и может раскрыть кошелек вывода ончейн. Для сохранения приватности вывода по умолчанию следует использовать relayer.

## Program Helpers

Используйте `VoidifyProgram`, когда нужны детерминированные PDA или доступ к базовой Anchor-программе.

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

Доступные PDA helpers:

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

Создайте конфиг relayer:

```bash
voidify config init --type relayer --path ./voidify.relayer.config.json
```

Конфиг должен включать:

- `rpcUrl`
- `programId`
- `keypair`
- `relayerServer.port`
- `relayerServer.host`
- `relayerServer.feedId`

Запустите сервис:

```bash
voidify -c ./voidify.relayer.config.json relayer start
```

Relayer предоставляет:

- `GET /health`
- `POST /api/relay/withdraw`

## Substream Service

Создайте конфиг substream server:

```bash
voidify config init --type substream --path ./voidify.substream.config.json
```

Запустите сервис:

```bash
voidify -c ./voidify.substream.config.json substream
```

CLI и SDK могут использовать substream-данные в трех режимах:

- `remote`: чтение событий из удаленного substream service;
- `local`: чтение и синхронизация через локальную SQLite DB;
- `auto`: использование удаленного сервиса с локальным кэшем.

## Экспорты

Основные экспорты:

- `Context`
- `VoidifyProgram`
- `voidify`
- `Note`
- `parseUnits`
- `formatUnits`
- `toBN`
- `SubstreamCliClient`
- `makeIndexedDBStores`

Типы для deposit, relayer, events, substream и withdrawal responses экспортируются из корня пакета.

## Разработка

```bash
npm install
npm run build
npm run dev -- --help
```

`npm run build` запускает TypeScript-компиляцию и переписывание alias через `tsc-alias`.

## Безопасность

- Никогда не передавайте Voidify note.
- Храните keypairs вне публичных репозиториев.
- Используйте отдельные keypairs/config files для ролей user, relayer и substream.
- Когда важна приватность вывода, предпочитайте relayer withdrawals.
- Перед production-использованием проверяйте `programId`, RPC endpoints, relayer endpoints и proof artifacts.
