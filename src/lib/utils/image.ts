/**
 * Browser-side image downscaling.
 *
 * Runs before upload for two reasons that both matter on this market's typical
 * connection: a modern phone photo is 4-8MB and a listing may have ten of them, and
 * nothing on the site ever renders one larger than about 900px. Sending the original
 * would spend the user's data allowance on pixels that get thrown away.
 *
 * BROWSER ONLY - uses `createImageBitmap` and `<canvas>`.
 */

/** Longest edge kept, in pixels. The detail gallery renders at roughly half this. */
const MAX_EDGE = 1600;

/** JPEG quality. 0.82 is where artefacts stop being visible on photographs. */
const JPEG_QUALITY = 0.82;

/**
 * Downscales and re-encodes to JPEG, or returns the original untouched.
 *
 * Falls back to the original file on any failure rather than blocking the upload.
 * `createImageBitmap` throws on a corrupt or unsupported file, and a canvas can be
 * tainted or unavailable; in all of those cases uploading the original is a worse
 * outcome than not uploading at all, and Cloudinary will reject a genuinely invalid
 * image anyway.
 *
 * Returns the original when the re-encode came out *larger*, which happens with
 * already-optimised small images and with flat graphics where PNG beats JPEG.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough: re-encoding would only lose quality for no size win.
    if (scale === 1 && file.type === "image/jpeg") {
      bitmap.close();

      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close();

      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

/** Keeps the original name recognisable after re-encoding changes the format. */
function replaceExtension(name: string, extension: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, "");

  return `${withoutExtension || "photo"}.${extension}`;
}
