type IdlSeed = { kind: string; value?: number[] };
type IdlAccount = { pda?: { seeds?: IdlSeed[] } };
type IdlInstruction = { accounts?: IdlAccount[] };
type IdlLike = { instructions?: IdlInstruction[] };

export function getConstSeed(idl: IdlLike, name: string): Buffer {
  const target = Buffer.from(name);
  for (const ix of idl.instructions ?? []) {
    for (const acct of ix.accounts ?? []) {
      for (const seed of acct.pda?.seeds ?? []) {
        if (seed.kind === "const" && seed.value) {
          const buf = Buffer.from(seed.value);
          if (buf.equals(target)) return buf;
        }
      }
    }
  }
  throw new Error(`const PDA seed "${name}" not found in IDL`);
}
