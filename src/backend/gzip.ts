// Gzip decode with progress against the expected unpacked size
// (from manifest.json). Static servers often send precompressed
// `.gz` with `Content-Encoding: gzip`, which browsers transparently
// decode — so sniff the magic and pass plain bytes through. Works
// on transcoding and byte-serving hosts alike.
export async function decodeWire(
    wire: Uint8Array,
    expected: number,
    onProgress: (loaded: number) => void,
): Promise<Uint8Array> {
    const gzipped = wire.length >= 2 && wire[0] === 0x1f && wire[1] === 0x8b;
    if (!gzipped) {
        if (wire.length !== expected) {
            throw new Error(`size mismatch: got ${wire.length}, want ${expected}`);
        }
        onProgress(wire.length);
        return wire;
    }
    const out = new Uint8Array(expected);
    let off = 0;
    const stream = new Blob([Uint8Array.from(wire)]).stream();
    const reader = stream.pipeThrough(new DecompressionStream('gzip')).getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        out.set(value, off);
        off += value.length;
        onProgress(off);
    }
    return off === expected ? out : out.slice(0, off);
}
