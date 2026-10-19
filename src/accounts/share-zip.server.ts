const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}
function crc(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export async function* zipFiles(
  files: AsyncIterable<{ name: string; bytes: Uint8Array }>,
): AsyncGenerator<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  for await (const file of files) {
    if (
      !file.name ||
      file.name.includes("\\") ||
      /[\p{Cc}\p{Cs}]/u.test(file.name) ||
      file.name.split("/").some((x) => !x || x === "." || x === "..")
    )
      throw new Error("ZIP_PATH");
    const name = Buffer.from(file.name),
      checksum = crc(file.bytes),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(file.bytes.byteLength, 18);
    header.writeUInt32LE(file.bytes.byteLength, 22);
    header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(file.bytes.byteLength, 20);
    record.writeUInt32LE(file.bytes.byteLength, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([record, name]));
    yield header;
    yield name;
    for (let p = 0; p < file.bytes.length; p += 65536)
      yield file.bytes.subarray(p, p + 65536);
    offset += header.length + name.length + file.bytes.length;
  }
  const start = offset;
  for (const record of central) {
    yield record;
    offset += record.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - start, 12);
  end.writeUInt32LE(start, 16);
  yield end;
}
