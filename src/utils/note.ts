import { generateRandomFieldElement } from "@/utils/bytes.js";
import { parseUnits, formatUnits } from "@/utils/amount.js";

export class NoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteError";
  }
}

export const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
};

function decimalsForToken(token: string): number {
  const d = TOKEN_DECIMALS[token];
  if (d === undefined) {
    throw new NoteError(`Unknown token "${token}" — add to TOKEN_DECIMALS`);
  }
  return d;
}

export class Note {
  readonly token: string;
  readonly amount: string;
  readonly amountRaw: bigint;
  readonly nullifier: string;
  readonly secret: string;
  readonly commitment: string;
  readonly nullifierHash: string;

  private constructor(
    token: string,
    amount: string,
    amountRaw: bigint,
    nullifier: string,
    secret: string,
    commitment: string,
    nullifierHash: string,
  ) {
    this.token = token;
    this.amount = amount;
    this.amountRaw = amountRaw;
    this.nullifier = nullifier;
    this.secret = secret;
    this.commitment = commitment;
    this.nullifierHash = nullifierHash;
  }

  static async generate(
    uiAmount: string,
    token: string = "SOL",
  ): Promise<Note> {
    const decimals = decimalsForToken(token);
    const amountRaw = parseUnits(uiAmount, decimals);

    const normalized = formatUnits(amountRaw, decimals);

    const nullifier = generateRandomFieldElement();
    const secret = generateRandomFieldElement();
    const { commitment, nullifierHash } = await Note.computeHashes(
      nullifier,
      secret,
      amountRaw,
    );

    return new Note(
      token,
      normalized,
      amountRaw,
      nullifier.toString(),
      secret.toString(),
      commitment,
      nullifierHash,
    );
  }

  static async deserialize(noteString: string): Promise<Note> {
    const parts = noteString.split("-");

    if (parts.length !== 5) {
      throw new NoteError(
        `Invalid note format: expected 5 parts, got ${parts.length}`,
      );
    }

    const [prefix, token, uiAmount, nullifierStr, secretStr] = parts;

    if (prefix !== "voidify") {
      throw new NoteError(
        `Invalid prefix: expected 'voidify', got '${prefix}'`,
      );
    }

    const decimals = decimalsForToken(token);
    const amountRaw = parseUnits(uiAmount, decimals);
    const normalized = formatUnits(amountRaw, decimals);

    const nullifier = BigInt(nullifierStr);
    const secret = BigInt(secretStr);

    const { commitment, nullifierHash } = await Note.computeHashes(
      nullifier,
      secret,
      amountRaw,
    );

    return new Note(
      token,
      normalized,
      amountRaw,
      nullifier.toString(),
      secret.toString(),
      commitment,
      nullifierHash,
    );
  }

  serialize(): string {
    return `voidify-${this.token}-${this.amount}-${this.nullifier}-${this.secret}`;
  }

  async verify(commitment: string): Promise<boolean> {
    const { commitment: computedCommitment, nullifierHash } =
      await Note.computeHashes(
        BigInt(this.nullifier),
        BigInt(this.secret),
        this.amountRaw,
      );

    if (commitment !== undefined) {
      return commitment === computedCommitment;
    }

    return (
      computedCommitment === this.commitment &&
      nullifierHash === this.nullifierHash
    );
  }

  private static async computeHashes(
    nullifier: bigint,
    secret: bigint,
    amount: bigint,
  ): Promise<{ commitment: string; nullifierHash: string }> {
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon();

    const commitment = poseidon([nullifier, secret, amount]);
    const nullifierHash = poseidon([nullifier]);

    return {
      commitment: poseidon.F.toString(commitment),
      nullifierHash: poseidon.F.toString(nullifierHash),
    };
  }
}
