import { describe, test, expect } from "bun:test";
import { parseSSEStream } from "../sseParser";

function makeReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return stream.getReader();
}

describe("parseSSEStream", () => {
  test("parses single SSE event", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader(['data: {"text":"hello"}\n']);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(1);
    expect(events[0].text).toBe("hello");
  });

  test("parses multiple events", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader([
      'data: {"id":1}\ndata: {"id":2}\n',
    ]);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(2);
    expect(events[0].id).toBe(1);
    expect(events[1].id).toBe(2);
  });

  test("handles events split across chunks", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader([
      'data: {"val',
      'ue":"split"}\n',
    ]);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(1);
    expect(events[0].value).toBe("split");
  });

  test("ignores non-data lines", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader([
      'event: message\ndata: {"ok":true}\nid: 123\n',
    ]);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(1);
    expect(events[0].ok).toBe(true);
  });

  test("skips unparseable JSON lines", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader([
      'data: not valid json\ndata: {"valid":true}\n',
    ]);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(1);
    expect(events[0].valid).toBe(true);
  });

  test("skips empty data lines", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader([
      'data: \ndata: {"ok":true}\n',
    ]);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(1);
  });

  test("handles empty stream", async () => {
    const events: Record<string, unknown>[] = [];
    const reader = makeReader([]);

    await parseSSEStream(reader, {
      onEvent: (data) => { events.push(data); },
    });

    expect(events.length).toBe(0);
  });

  test("calls onError for non-abort errors", async () => {
    let caughtError: Error | null = null;

    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("stream broke");
      },
    });

    await parseSSEStream(stream.getReader(), {
      onEvent: () => {},
      onError: (err) => { caughtError = err; },
    });

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toBe("stream broke");
  });

  test("silently handles AbortError", async () => {
    let errorCalled = false;

    const stream = new ReadableStream<Uint8Array>({
      pull() {
        const err = new DOMException("aborted", "AbortError");
        throw err;
      },
    });

    await parseSSEStream(stream.getReader(), {
      onEvent: () => {},
      onError: () => { errorCalled = true; },
    });

    expect(errorCalled).toBe(false);
  });

  test("supports async onEvent callbacks", async () => {
    const events: number[] = [];
    const reader = makeReader([
      'data: {"n":1}\ndata: {"n":2}\n',
    ]);

    await parseSSEStream(reader, {
      onEvent: async (data) => {
        await new Promise((r) => setTimeout(r, 1));
        events.push(data.n as number);
      },
    });

    expect(events).toEqual([1, 2]);
  });
});
