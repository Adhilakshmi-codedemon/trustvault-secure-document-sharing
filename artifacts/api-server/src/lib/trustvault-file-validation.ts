import type { File } from "@google-cloud/storage";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const allowedContentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isSupportedContentType(contentType: string): boolean {
  return allowedContentTypes.has(contentType.trim().toLowerCase());
}

async function readHeader(file: File): Promise<Buffer> {
  const stream = file.createReadStream({ start: 0, end: 63 });
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function beginsWith(header: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => header[index] === byte);
}

function hasValidSignature(header: Buffer, contentType: string): boolean {
  switch (contentType) {
    case "application/pdf":
      return header.subarray(0, 5).toString("ascii") === "%PDF-";
    case "image/png":
      return beginsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return beginsWith(header, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return ["GIF87a", "GIF89a"].some(
        (signature) => header.subarray(0, 6).toString("ascii") === signature,
      );
    case "image/webp":
      return (
        header.subarray(0, 4).toString("ascii") === "RIFF" &&
        header.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "application/msword":
      return beginsWith(header, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      // OOXML formats are ZIP containers. Type-specific package paths cannot
      // be inspected without unpacking untrusted archives, which is out of
      // scope for this small upload service.
      return beginsWith(header, [0x50, 0x4b, 0x03, 0x04]);
    case "text/plain":
    case "text/csv":
      return header.length > 0 && !header.includes(0);
    default:
      return false;
  }
}

export async function validateStoredDocument(
  file: File,
  expectedSize: number,
  expectedContentType: string,
): Promise<{ valid: boolean; reason: string }> {
  const normalizedType = expectedContentType.trim().toLowerCase();
  if (!isSupportedContentType(normalizedType)) {
    return { valid: false, reason: "unsupported_content_type" };
  }

  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  if (
    !Number.isSafeInteger(actualSize) ||
    actualSize < 1 ||
    actualSize > MAX_DOCUMENT_BYTES ||
    actualSize !== expectedSize
  ) {
    return { valid: false, reason: "size_mismatch_or_limit_exceeded" };
  }
  if ((metadata.contentType ?? "").toLowerCase() !== normalizedType) {
    return { valid: false, reason: "content_type_mismatch" };
  }

  const header = await readHeader(file);
  if (!hasValidSignature(header, normalizedType)) {
    return { valid: false, reason: "file_signature_mismatch" };
  }
  return { valid: true, reason: "ok" };
}
