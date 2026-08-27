/** SHA256(plain) → 64-char lowercase hex (never send plain password over the wire). */
export async function sha256Hex(plain: string): Promise<string> {
    const data = new TextEncoder().encode(plain);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
