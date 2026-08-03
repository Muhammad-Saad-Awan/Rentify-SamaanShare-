import { createHash } from "node:crypto";

/**
 * Cloudinary signing, without the SDK.
 *
 * The whole integration is two REST calls - a signed upload from the browser and a
 * destroy from the server - and both need nothing more than an SHA-1 of sorted
 * parameters. Adding the `cloudinary` package would pull a large dependency for a
 * twenty-line signature, so it is computed here instead.
 *
 * SERVER ONLY. `CLOUDINARY_API_SECRET` must never reach the browser, which is why
 * uploads are *signed* here and *performed* there: the client receives a signature
 * scoped to one folder and one timestamp, never the secret itself.
 */

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads the three credentials, failing loudly if any is missing.
 *
 * Called at request time rather than at module load: throwing during module
 * evaluation would take down every route that transitively imports this, including
 * pages that never upload anything.
 */
export function getCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local."
    );
  }

  return { cloudName, apiKey, apiSecret };
}

/**
 * Where a user's not-yet-submitted uploads live.
 *
 * The user id is IN THE PATH deliberately, and it is what makes deletion safe. An
 * image uploaded before the listing exists has no database row, so there is nothing
 * to check ownership against - the folder is the only proof. `deletePendingImage`
 * verifies the public id starts with the caller's own folder, so one user cannot
 * delete another's pending upload by guessing an id.
 */
export function pendingUploadFolder(userId: string): string {
  return `samaanshare/pending/${userId}`;
}

export interface SignedUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Signs an upload into one specific folder.
 *
 * Only `folder` and `timestamp` are signed, and that set is the security boundary:
 * Cloudinary rejects the upload if the client alters either, so a signature issued
 * for one user's folder cannot be redirected into another's.
 *
 * The timestamp also bounds replay - Cloudinary refuses signatures older than an
 * hour - so a leaked signature is not a permanent upload credential.
 *
 * What this does NOT constrain is file size or format. Signed uploads cannot carry
 * those limits; enforcing them server-side requires a named upload preset configured
 * in the Cloudinary dashboard. Until then the guards are: the endpoint is
 * `image/upload`, so Cloudinary itself rejects non-images; the client compresses and
 * size-checks before sending; issuing signatures is rate limited and requires a
 * session; and every returned URL is re-validated against the Cloudinary host on
 * submit. Worth adding a preset before launch.
 */
export function signUpload(folder: string): SignedUploadParams {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary's rule: signed parameters sorted by key, joined as `k=v&k=v`, with
  // the API secret appended - then SHA-1. Unsigned parameters (api_key, file) are
  // excluded, and including them here would produce a signature Cloudinary rejects.
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  return { cloudName, apiKey, timestamp, signature, folder };
}

/** Root of every not-yet-attached upload, across all users. */
export const PENDING_UPLOAD_ROOT = "samaanshare/pending";

export interface ListedUpload {
  publicId: string;
  createdAt: Date;
}

/**
 * Pages through every asset under a prefix.
 *
 * For the cleanup job, which needs the whole pending tree rather than a known set of
 * ids. Cloudinary caps a page at 500 and returns a cursor, so the caller loops until
 * the cursor is absent - a single unpaginated call would silently miss everything past
 * the first page, which is exactly the backlog a cleanup job exists to find.
 */
export async function listUploadsByPrefix(
  prefix: string,
  cursor?: string
): Promise<{ uploads: ListedUpload[]; nextCursor: string | undefined }> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  const query = new URLSearchParams({
    prefix,
    type: "upload",
    max_results: "500",
  });

  if (cursor) {
    query.set("next_cursor", cursor);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image?${query.toString()}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudinary listing failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    resources?: { public_id?: string; created_at?: string }[];
    next_cursor?: string;
  };

  const uploads: ListedUpload[] = [];

  for (const resource of payload.resources ?? []) {
    if (!resource.public_id || !resource.created_at) {
      continue;
    }

    uploads.push({
      publicId: resource.public_id,
      createdAt: new Date(resource.created_at),
    });
  }

  return { uploads, nextCursor: payload.next_cursor };
}

export interface UploadedImage {
  publicId: string;
  /** Cloudinary's own URL for the asset - never the client's claim. */
  secureUrl: string;
  format: string;
  bytes: number;
}

/**
 * Looks up assets by public id, in one Admin API call.
 *
 * This is what makes a submitted image trustworthy. Without it the server has only
 * the client's word that a public id exists, is an image, and corresponds to the URL
 * sent alongside it - and those are three separate lies a crafted request can tell.
 * The returned `secureUrl` is Cloudinary's, so the URL written to the database is
 * derived rather than accepted.
 *
 * The `public_ids` filter on the listing endpoint takes the whole set at once, so ten
 * photos cost one request instead of ten. Ids that do not exist are simply absent
 * from the response, which is how the caller detects them.
 *
 * Basic auth with the API secret - Admin API, so this must only ever run server-side.
 */
export async function getUploadedImages(
  publicIds: readonly string[]
): Promise<Map<string, UploadedImage>> {
  const found = new Map<string, UploadedImage>();

  if (publicIds.length === 0) {
    return found;
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  const query = new URLSearchParams();

  for (const publicId of publicIds) {
    query.append("public_ids[]", publicId);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${query.toString()}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      },
      // Never serve a cached answer: this is an authorization input, and a stale hit
      // could confirm an asset that has since been deleted.
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Cloudinary resource lookup failed with ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    resources?: {
      public_id?: string;
      secure_url?: string;
      format?: string;
      bytes?: number;
    }[];
  };

  for (const resource of payload.resources ?? []) {
    if (!resource.public_id || !resource.secure_url) {
      continue;
    }

    found.set(resource.public_id, {
      publicId: resource.public_id,
      secureUrl: resource.secure_url,
      format: resource.format ?? "",
      bytes: resource.bytes ?? 0,
    });
  }

  return found;
}

/**
 * Deletes an asset by public id.
 *
 * Uses the `destroy` endpoint, which needs its own signature over
 * `public_id` + `timestamp`. Returns whether Cloudinary reported the asset gone;
 * `"not found"` counts as success, because the caller's intent - that it no longer
 * exist - is satisfied either way, and an already-deleted image should not surface an
 * error to the user.
 */
export async function destroyImage(publicId: string): Promise<boolean> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const body = new URLSearchParams({
    public_id: publicId,
    api_key: apiKey,
    timestamp: String(timestamp),
    signature,
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    { method: "POST", body }
  );

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as { result?: string };

  return result.result === "ok" || result.result === "not found";
}
