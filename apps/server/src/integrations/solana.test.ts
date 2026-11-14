import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { readMemo, SolanaError, writeMemo } from "./solana";

const originalFetch = globalThis.fetch;
const BLOCKHASH = "11111111111111111111111111111111"; // 32 zero bytes
const SIGNATURE =
  "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const pair = generateKeyPairSync("ed25519");
const jwk = pair.privateKey.export({ format: "jwk" });
const seed = Buffer.from(jwk.d as string, "base64url");
const publicKey = Buffer.from(jwk.x as string, "base64url");

beforeAll(() => {
  process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
  process.env.SOLANA_KEYPAIR = JSON.stringify([...seed, ...publicKey]);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
}

type Call = { method: string; params: unknown[] };

function mockRpc(handlers: Record<string, (params: unknown[]) => Response>): Call[] {
  const seen: Call[] = [];
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Call;
    seen.push(body);
    const handler = handlers[body.method];
    if (!handler) throw new Error(`unexpected ${body.method}`);
    return handler(body.params);
  }) as unknown as typeof fetch;
  return seen;
}

describe("writeMemo", () => {
  test("signs and sends a Memo transaction, returns signature and explorer url", async () => {
    const calls = mockRpc({
      getLatestBlockhash: () => rpcResponse({ value: { blockhash: BLOCKHASH } }),
      sendTransaction: () => rpcResponse(SIGNATURE),
      getSignatureStatuses: () =>
        rpcResponse({ value: [{ err: null, confirmationStatus: "confirmed" }] }),
    });

    const receipt = await writeMemo("kip:abc123");
    expect(receipt).toEqual({
      signature: SIGNATURE,
      explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}`,
    });

    const send = calls.find((call) => call.method === "sendTransaction");
    const tx = Buffer.from(send?.params[0] as string, "base64");
    expect(tx[0]).toBe(1);
    const signature = tx.subarray(1, 65);
    const message = tx.subarray(65);
    expect(verify(null, message, pair.publicKey, signature)).toBe(true);
    expect(message.subarray(0, 3)).toEqual(Buffer.from([1, 0, 1]));
    expect(message.subarray(4, 36)).toEqual(publicKey);
    expect(message.subarray(message.length - 10).toString()).toBe("kip:abc123");
  });

  test("fails when the transaction errors on chain", async () => {
    mockRpc({
      getLatestBlockhash: () => rpcResponse({ value: { blockhash: BLOCKHASH } }),
      sendTransaction: () => rpcResponse(SIGNATURE),
      getSignatureStatuses: () => rpcResponse({ value: [{ err: { InstructionError: [0, "x"] } }] }),
    });
    await expect(writeMemo("hello")).rejects.toThrow(/failed on chain/);
  });

  test("surfaces an RPC error without the rpc url", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ error: { message: "Blockhash not found" } })),
    ) as unknown as typeof fetch;
    const error = await writeMemo("hello").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SolanaError);
    expect(String(error)).toContain("Blockhash not found");
    expect(String(error)).not.toContain("rpc.test.invalid");
  });

  test("rejects empty and oversized text before calling out", async () => {
    const calls = mockRpc({});
    await expect(writeMemo("")).rejects.toThrow(/empty/);
    await expect(writeMemo("x".repeat(567))).rejects.toThrow(/longer than/);
    expect(calls).toHaveLength(0);
  });
});

describe("readMemo", () => {
  const transaction = (instructions: unknown[]) =>
    rpcResponse({ meta: { err: null }, transaction: { message: { instructions } } });

  test("returns the memo text of the transaction", async () => {
    const calls = mockRpc({
      getTransaction: () =>
        transaction([
          { programId: "11111111111111111111111111111111", parsed: { type: "transfer" } },
          { program: "spl-memo", programId: MEMO_PROGRAM, parsed: "kip:abc123" },
        ]),
    });
    expect(await readMemo(SIGNATURE)).toBe("kip:abc123");
    expect(calls[0]?.params[0]).toBe(SIGNATURE);
  });

  test("throws when the transaction is unknown or has no memo", async () => {
    mockRpc({ getTransaction: () => rpcResponse(null) });
    await expect(readMemo(SIGNATURE)).rejects.toThrow(/not found/);
    mockRpc({
      getTransaction: () => transaction([{ programId: "11111111111111111111111111111111" }]),
    });
    await expect(readMemo(SIGNATURE)).rejects.toThrow(/no memo/);
  });
});
