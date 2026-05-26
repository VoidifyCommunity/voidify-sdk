# Voidify SDK

[English](../README.md) | [中文](README.zh-CN.md) | [Русский](README.ru.md) | [日本語](README.ja.md)

`@voidifydao/sdk` — это SDK и CLI Voidify для депозитов, приватных notes, вывода через relayer, сервисов relayer и индексированной активности протокола в Solana.

## Установка

Для использования в коде:

```sh
npm install @voidifydao/sdk
```

Для использования как инструмента командной строки:

```sh
npm install -g @voidifydao/sdk
voidify --help
```

## Настройка CLI

Создайте JSON-файл конфигурации, затем заполните нужные значения в этом же файле:

```sh
voidify config init --type default --path ./voidify.json
voidify -c ./voidify.json config set programId YOUR_VOIDIFY_PROGRAM_ID
voidify -c ./voidify.json config set keypair.path /absolute/path/to/solana-keypair.json
```

Перед генерацией доказательства вывода загрузите артефакты из
[релиза Voidify ceremony record v1.0.0](https://github.com/VoidifyCommunity/voidify-ceremony-record/releases/tag/v1.0.0).
Распакуйте `withdraw.wasm` и `withdraw.zkey`, затем разместите их по путям
`proof.wasmPath` и `proof.zkeyPath` в созданной конфигурации.

Все следующие команды используют созданный файл `./voidify.json` через параметр `-c`.

## Команды CLI

Создайте приватную note:

```sh
voidify -c ./voidify.json note gen 1
```

Внесите `1 SOL`. Если параметр `--commitment` не указан, команда создаст и выведет новую note:

```sh
voidify -c ./voidify.json deposit 1
```

Покажите депозиты в пуле:

```sh
voidify -c ./voidify.json deposit list 1
```

Выведите средства через автоматически выбранный доступный relayer:

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS
```

Выберите relayer по имени:

```sh
voidify -c ./voidify.json withdraw "YOUR_PRIVATE_NOTE" --recipient RECIPIENT_SOLANA_ADDRESS --relayer RELAYER_NAME
```

> Надежно храните приватную note. Любой, кто получит note, сможет вывести депозит, а потерянную note невозможно восстановить.

## Запуск Relayer

Создайте JSON-конфигурацию relayer, заполните обязательные значения и используйте этот файл для команд relayer:

```sh
voidify config init --type relayer --path ./relayer.json
voidify -c ./relayer.json relayer start
```

## Использование SDK

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

Пакет также экспортирует помощники вывода, типы relayer, `VoidifyProgram`, клиенты и хранилища substream, а также утилиты сумм и notes.
