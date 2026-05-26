import { MerkleTree } from "fixed-merkle-tree";
import { PublicKey } from "@solana/web3.js";
import { buildBn128, utils } from "ffjavascript";
import { publicKeyToLoHi } from "@/utils/bytes.js";

const { unstringifyBigInts } = utils;

const ZERO_ELEMENT = BigInt(
  "0x28940deeacd1ca2831336874e87429db0e728a67a472b7ac8195c43c2fb13009",
).toString();

export async function generateMerkleProof(
  commitment: string,
  commitments: string[],
) {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();

  const leaves = commitments;

  const tree = new MerkleTree(20, leaves, {
    hashFunction: (a, b) =>
      poseidon.F.toString(poseidon([BigInt(a), BigInt(b)])),
    zeroElement: ZERO_ELEMENT,
  });

  const root = tree.root;

  const leafIndex = leaves.findIndex((l) => l === commitment);
  if (leafIndex === -1) {
    throw new Error(
      "Commitment not found in the on-chain tree. " +
        "Ensure the deposit was confirmed before calling generateMerkleProof.",
    );
  }

  const { pathElements, pathIndices } = tree.path(leafIndex);
  return { pathElements, pathIndices, root };
}

export async function generateProof(
  nullifier: string,
  secret: string,
  amount: string,
  commitment: string,
  nullifierHash: string,
  recipient: PublicKey,
  relayer: PublicKey,
  fee: BigInt,
  refund: BigInt,
  commitments: string[],
  wasmPath: string,
  zkeyPath: string,
) {
  const { root, pathElements, pathIndices } = await generateMerkleProof(
    commitment,
    commitments,
  );

  const { lo: recipientLo, hi: recipientHi } = publicKeyToLoHi(recipient);
  const { lo: relayerLo, hi: relayerHi } = publicKeyToLoHi(relayer);

  const input = {
    root,
    nullifierHash: nullifierHash,
    recipient_lo: recipientLo.toString(),
    recipient_hi: recipientHi.toString(),
    relayer_lo: relayerLo.toString(),
    relayer_hi: relayerHi.toString(),
    fee: fee.toString(),
    refund: refund.toString(),
    nullifier: nullifier,
    secret: secret,
    amount: amount,
    pathElements,
    pathIndices,
  };

  let snarkjs: typeof import("snarkjs");
  try {
    snarkjs = await import("snarkjs");
  } catch (error) {
    throw new Error(
      "Failed to load snarkjs library. Please ensure it is installed.",
      {
        cause: error,
      },
    );
  }

  try {
    const { proof } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath,
    );
    return { root, proof };
  } catch (error) {
    throw new Error("Failed to generate zero-knowledge proof.", {
      cause: error,
    });
  }
}

function g1UncompressedNegated(curve: any, p1Raw: any) {
  const p1 = curve.G1.fromObject(p1Raw);
  const negP1 = curve.G1.neg(p1);
  const buff = new Uint8Array(64);
  curve.G1.toRprUncompressed(buff, 0, negP1);
  return Buffer.from(buff);
}

function g1Uncompressed(curve: any, p1Raw: any) {
  let p1 = curve.G1.fromObject(p1Raw);

  let buff = new Uint8Array(64);
  curve.G1.toRprUncompressed(buff, 0, p1);

  return Buffer.from(buff);
}

function g2Uncompressed(curve: any, p2Raw: any) {
  let p2 = curve.G2.fromObject(p2Raw);

  let buff = new Uint8Array(128);
  curve.G2.toRprUncompressed(buff, 0, p2);

  return Buffer.from(buff);
}

export const proofToBytes = async (proof: any): Promise<number[]> => {
  let proofProc = unstringifyBigInts(proof);

  let curve = await buildBn128();
  const pi_a = g1UncompressedNegated(curve, proofProc.pi_a);
  const pi_b = g2Uncompressed(curve, proofProc.pi_b);
  const pi_c = g1Uncompressed(curve, proofProc.pi_c);

  const allBytes = Buffer.concat([pi_a, pi_b, pi_c]);

  if (allBytes.length !== 256) {
    throw new Error(`Expected 256 bytes, but got ${allBytes.length}`);
  }

  return Array.from(allBytes);
};
