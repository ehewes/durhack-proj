import { createPrivateKey, sign } from "node:crypto";
import { z } from "zod";
import { parseEnv } from "../env";

/** Read fresh on each call (not the cached env) so a rotated key or RPC takes effect at once. */
function requireEnv<K extends "SOLANA_RPC_URL" | "SOLANA_KEYPAIR">(key: K): string {
  const value = parseEnv(process.env)[key];
  if (!value) throw new SolanaError(`${key} is not set (see .env.example)`);
  return value;
}

/**
 * The only Solana client: write a Memo program transaction, read it back by
 * signature. Plain JSON-RPC over fetch, no Anchor and no custom program. The
 * memo proves when a text existed, nothing more (docs/DOMAIN.md).
 *
 * `SOLANA_RPC_URL` is the mainnet endpoint. `SOLANA_KEYPAIR` is the funded
 * fee payer: a JSON array of 64 bytes (solana-keygen) or a base58 secret key.
 * The keypair and RPC URL are never logged or put in an error message.
 */

const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const EXPLORER_TX = "https://explorer.solana.com/tx/";
const MAX_MEMO_BYTES = 566;
const TIMEOUT_MS = 15_000;
const CONFIRM_POLL_MS = 1_000;
const CONFIRM_ATTEMPTS = 30;
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export class SolanaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolanaError";
  }
}

export type MemoReceipt = { signature: string; explorerUrl: string };

function base58Decode(text: string): Uint8Array {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new SolanaError("Invalid base58 value");
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros++;
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes]);
}

function parseKeypair(raw: string): { seed: Uint8Array; publicKey: Uint8Array } {
  let bytes: Uint8Array;
  try {
    const text = raw.trim();
    bytes = text.startsWith("[")
      ? Uint8Array.from(z.array(z.number().int().min(0).max(255)).parse(JSON.parse(text)))
      : base58Decode(text);
  } catch {
    throw new SolanaError("SOLANA_KEYPAIR is not a valid keypair");
  }
  if (bytes.length !== 64) throw new SolanaError("SOLANA_KEYPAIR must be a 64 byte keypair");
  return { seed: bytes.slice(0, 32), publicKey: bytes.slice(32) };
}

function compactU16(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  out.push(rest);
  return out;
}

/** Legacy transaction with one signer (the fee payer) and one Memo instruction. */
function buildTransaction(
  text: string,
  blockhash: Uint8Array,
  keypair: { seed: Uint8Array; publicKey: Uint8Array },
): Uint8Array {
  const data = new TextEncoder().encode(text);
  const message = Uint8Array.from([
    1,
    0,
    1, // 1 signature, 0 readonly signed, 1 readonly unsigned (the Memo program)
    ...compactU16(2),
    ...keypair.publicKey,
    ...base58Decode(MEMO_PROGRAM),
    ...blockhash,
    ...compactU16(1),
    1, // program id index
    ...compactU16(1),
    0, // the payer signs the memo, so the program checks the signature
    ...compactU16(data.length),
    ...data,
  ]);
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, keypair.seed]),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(null, message, key);
  return Uint8Array.from([...compactU16(1), ...signature, ...message]);
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const url = requireEnv("SOLANA_RPC_URL");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SolanaError(`Solana ${method} request failed`);
  }
  if (!res.ok) throw new SolanaError(`Solana ${method} failed (${res.status})`);
  const parsed = z
    .object({ result: z.unknown().optional(), error: z.object({ message: z.string() }).optional() })
    .safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new SolanaError(`Solana ${method} returned an unreadable response`);
  if (parsed.data.error)
    throw new SolanaError(`Solana ${method} error: ${parsed.data.error.message}`);
  return parsed.data.result;
}

const blockhashSchema = z.object({ value: z.object({ blockhash: z.string() }) });
const statusesSchema = z.object({
  value: z.array(
    z.object({ err: z.unknown().nullish(), confirmationStatus: z.string().nullish() }).nullable(),
  ),
});
const transactionSchema = z
  .object({
    meta: z.object({ err: z.unknown().nullish() }).nullish(),
    transaction: z.object({
      message: z.object({
        instructions: z.array(z.object({ programId: z.string(), parsed: z.unknown().optional() })),
      }),
    }),
  })
  .nullable();

async function confirm(signature: string): Promise<void> {
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    const parsed = statusesSchema.safeParse(await rpc("getSignatureStatuses", [[signature]]));
    const status = parsed.success ? parsed.data.value[0] : null;
    if (status?.err) throw new SolanaError("Memo transaction failed on chain");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized")
      return;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  throw new SolanaError("Memo transaction was not confirmed in time");
}

/** Sends `text` in a Memo transaction on mainnet and waits until it is confirmed. */
export async function writeMemo(text: string): Promise<MemoReceipt> {
  if (!text) throw new SolanaError("Memo text is empty");
  if (new TextEncoder().encode(text).length > MAX_MEMO_BYTES)
    throw new SolanaError(`Memo text is longer than ${MAX_MEMO_BYTES} bytes`);
  const keypair = parseKeypair(requireEnv("SOLANA_KEYPAIR"));
  const hash = blockhashSchema.safeParse(
    await rpc("getLatestBlockhash", [{ commitment: "finalized" }]),
  );
  if (!hash.success) throw new SolanaError("Solana returned an unreadable blockhash");
  const transaction = buildTransaction(text, base58Decode(hash.data.value.blockhash), keypair);
  const sent = z
    .string()
    .safeParse(
      await rpc("sendTransaction", [
        Buffer.from(transaction).toString("base64"),
        { encoding: "base64", preflightCommitment: "confirmed" },
      ]),
    );
  if (!sent.success) throw new SolanaError("Solana returned an unreadable signature");
  await confirm(sent.data);
  return { signature: sent.data, explorerUrl: `${EXPLORER_TX}${sent.data}` };
}

/** The memo text stored in the transaction with this signature. */
export async function readMemo(signature: string): Promise<string> {
  const parsed = transactionSchema.safeParse(
    await rpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]),
  );
  if (!parsed.success) throw new SolanaError("Solana returned an unreadable transaction");
  if (!parsed.data) throw new SolanaError("Transaction not found");
  const memo = parsed.data.transaction.message.instructions.find(
    (instruction) => instruction.programId === MEMO_PROGRAM,
  );
  if (typeof memo?.parsed !== "string") throw new SolanaError("Transaction has no memo");
  return memo.parsed;
}
