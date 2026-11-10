import { enginePutBlob } from "@/lib/engine";
import { sealBlob } from "@/lib/rabta";

async function prepareBlobUpload(fileOrPrepared) {
  if (fileOrPrepared && fileOrPrepared.rawBytes) {
    return fileOrPrepared;
  }

  const name = fileOrPrepared.name || "gupt.bin";
  const buffer = await fileOrPrepared.arrayBuffer();
  const rawBytes = new Uint8Array(buffer);

  return { rawBytes, name, fileSize: rawBytes.byteLength };
}

function emitUploadProgress(options, update) {
  options?.onProgress?.(update);
}

/**
 * Write an encrypted blob into the Dexie engine and return its verified hash.
 * No relay traffic here: the replication worker mirrors bytes to every relay
 * in the background, so the UI never waits on a network upload.
 */
export async function uploadFile(file, options = {}) {
  if (options?.signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const prepared = await prepareBlobUpload(file);
  const emit = (update) => emitUploadProgress(options, update);

  let rawBytes = prepared.rawBytes;
  if (!rawBytes && prepared instanceof File) {
    rawBytes = new Uint8Array(await prepared.arrayBuffer());
  }

  // Ensure body is RABTA1 container format
  let bodyBytes = rawBytes;
  const magic = new TextDecoder().decode(rawBytes.subarray(0, 6));
  if (magic !== "RABTA1") {
    const tempSecret = crypto.getRandomValues(new Uint8Array(32));
    bodyBytes = sealBlob(rawBytes, tempSecret);
  }

  const uploadId = "engine-blob";
  emit({
    phase: "uploading",
    uploadId,
    server: "local engine",
    type: "rabta",
    method: "PUT",
    status: "started",
    attempt: 1,
    totalUploads: 1,
    percent: 0,
  });

  try {
    const hash = await enginePutBlob(bodyBytes);
    emit({
      phase: "uploading",
      uploadId,
      server: "local engine",
      type: "rabta",
      method: "PUT",
      status: "done",
      percent: 100,
      retryCount: 0,
      maxRetries: 0,
      totalUploads: 1,
    });

    return {
      type: "media",
      hash,
      url: "",
      server: "local engine",
      relays: [],
    };
  } catch (err) {
    emit({
      phase: "uploading",
      uploadId: "engine-blob-overall",
      server: "local engine",
      type: "rabta",
      method: "PUT",
      status: "failed",
      error: err?.message || String(err),
      totalUploads: 1,
    });
    throw err;
  }
}
