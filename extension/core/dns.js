export const ENDPOINTS = Object.freeze({
  sg: "https://doh-sg.blahdns.com/dns-query",
  de: "https://doh-de.blahdns.com/dns-query",
});

const QUERY_ID = 0xb17d;
const MAX_MESSAGE_SIZE = 65535;
const TIMEOUT_MS = 8000;
const QUERY = Uint8Array.from([
  QUERY_ID >> 8,
  QUERY_ID & 0xff,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x07,
  0x65,
  0x78,
  0x61,
  0x6d,
  0x70,
  0x6c,
  0x65,
  0x03,
  0x63,
  0x6f,
  0x6d,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
]);

function readUint16(bytes, offset) {
  if (offset + 2 > bytes.length) throw new Error("DNS response is truncated.");
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readName(bytes, start) {
  let offset = start;
  let nextOffset = -1;
  const labels = [];
  let wireLength = 1;
  const visited = new Set();
  for (let steps = 0; steps < 128; steps++) {
    if (offset >= bytes.length) throw new Error("DNS name is out of bounds.");
    const size = bytes[offset];
    if ((size & 0xc0) === 0xc0) {
      if (offset + 1 >= bytes.length)
        throw new Error("DNS compression pointer is truncated.");
      const pointer = ((size & 0x3f) << 8) | bytes[offset + 1];
      if (pointer >= bytes.length || visited.has(pointer))
        throw new Error("DNS compression pointer is invalid.");
      visited.add(pointer);
      if (nextOffset < 0) nextOffset = offset + 2;
      offset = pointer;
      continue;
    }
    if (size & 0xc0) throw new Error("DNS label length is invalid.");
    offset++;
    if (size === 0)
      return {
        name: labels.join(".").toLowerCase(),
        nextOffset: nextOffset < 0 ? offset : nextOffset,
      };
    if (size > 63 || offset + size > bytes.length)
      throw new Error("DNS label is out of bounds.");
    if (wireLength + size + 1 > 255)
      throw new Error("DNS name exceeds the protocol limit.");
    wireLength += size + 1;
    let label = "";
    for (let i = 0; i < size; i++)
      label += String.fromCharCode(bytes[offset + i]);
    labels.push(label);
    offset += size;
  }
  throw new Error("DNS name pointer loop detected.");
}

function readResourceRecord(bytes, offset, collect) {
  const owner = readName(bytes, offset);
  offset = owner.nextOffset;
  if (offset + 10 > bytes.length)
    throw new Error("DNS resource record header is truncated.");
  const type = readUint16(bytes, offset);
  const klass = readUint16(bytes, offset + 2);
  const length = readUint16(bytes, offset + 8);
  const dataStart = offset + 10;
  const dataEnd = dataStart + length;
  if (dataEnd > bytes.length)
    throw new Error("DNS resource record data is truncated.");

  if (collect && klass === 1 && type === 1) {
    if (length !== 4) throw new Error("DNS A record length is invalid.");
    collect.push(
      `${bytes[dataStart]}.${bytes[dataStart + 1]}.${bytes[dataStart + 2]}.${bytes[dataStart + 3]}`,
    );
  } else if (collect && klass === 1 && type === 5) {
    const target = readName(bytes, dataStart);
    if (target.nextOffset !== dataEnd)
      throw new Error("DNS CNAME record length is invalid.");
    collect.push(target.name);
  }
  return dataEnd;
}

function parseResponse(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12 || bytes.length > MAX_MESSAGE_SIZE)
    throw new Error("DNS response size is invalid.");
  if (readUint16(bytes, 0) !== QUERY_ID)
    throw new Error("DNS response ID does not match.");
  const flags = readUint16(bytes, 2);
  if ((flags & 0x8000) === 0) throw new Error("DNS response flag is missing.");
  if (flags & 0x0200) throw new Error("DNS response is truncated.");
  if ((flags & 0x7800) !== 0) throw new Error("DNS opcode does not match.");
  const questionCount = readUint16(bytes, 4);
  const answerCount = readUint16(bytes, 6);
  const authorityCount = readUint16(bytes, 8);
  const additionalCount = readUint16(bytes, 10);
  if (questionCount !== 1)
    throw new Error("DNS question count does not match.");

  const question = readName(bytes, 12);
  let offset = question.nextOffset;
  if (offset + 4 > bytes.length) throw new Error("DNS question is truncated.");
  if (
    question.name !== "example.com" ||
    readUint16(bytes, offset) !== 1 ||
    readUint16(bytes, offset + 2) !== 1
  ) {
    throw new Error("DNS question does not match the diagnostic query.");
  }
  offset += 4;

  const answers = [];
  for (let i = 0; i < answerCount; i++)
    offset = readResourceRecord(bytes, offset, answers);
  for (let i = 0; i < authorityCount + additionalCount; i++)
    offset = readResourceRecord(bytes, offset);
  if (offset !== bytes.length)
    throw new Error("DNS response contains trailing data.");

  const rcode = flags & 0x000f;
  const rcodeNames = [
    "NOERROR",
    "FORMERR",
    "SERVFAIL",
    "NXDOMAIN",
    "NOTIMP",
    "REFUSED",
  ];
  const name = rcodeNames[rcode] || `RCODE ${rcode}`;
  return {
    rcode,
    answers,
    message:
      rcode === 0
        ? "DNS-over-HTTPS diagnostic query succeeded (NOERROR)."
        : `DNS-over-HTTPS endpoint returned ${name}.`,
  };
}

async function readBody(response) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > MAX_MESSAGE_SIZE)
    throw new Error("DNS response exceeds the size limit.");
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_MESSAGE_SIZE) {
          await reader.cancel();
          throw new Error("DNS response exceeds the size limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock?.();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_MESSAGE_SIZE)
    throw new Error("DNS response exceeds the size limit.");
  return bytes;
}

export async function testDns(region) {
  if (region !== "sg" && region !== "de")
    throw new Error("DNS region must be sg or de.");
  const endpoint = ENDPOINTS[region];
  if (
    typeof globalThis.fetch !== "function" ||
    typeof globalThis.AbortController !== "function"
  ) {
    throw new Error("This browser does not support the required network APIs.");
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const started = globalThis.performance?.now?.() ?? Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/dns-message",
        "content-type": "application/dns-message",
      },
      body: QUERY.slice(),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `DNS endpoint returned HTTP ${response.status || "error"}.`,
      );
    const mime = response.headers?.get?.("content-type") || "";
    if (!/^application\/dns-message(?:\s*;|\s*$)/i.test(mime.trim()))
      throw new Error("DNS endpoint returned an unsupported content type.");
    const result = parseResponse(await readBody(response));
    const ended = globalThis.performance?.now?.() ?? Date.now();
    return {
      endpoint,
      ...result,
      latencyMs: Math.max(0, Math.round(ended - started)),
    };
  } catch (error) {
    if (timedOut) throw new Error("DNS diagnostic timed out.");
    if (error instanceof Error && error.message.startsWith("DNS ")) throw error;
    throw new Error("DNS diagnostic request failed.");
  } finally {
    clearTimeout(timer);
  }
}
