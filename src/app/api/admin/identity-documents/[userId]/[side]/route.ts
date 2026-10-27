import { getActiveAdmin } from "@/lib/auth/session";
import { privateDownloadUrl } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

/**
 * One side of a member's CNIC, for an administrator. Admin only.
 *
 * WHY A ROUTE AND NOT A URL. The image is a private Cloudinary asset with no public address. Handing
 * the browser even a short-lived signed link would let it be copied out of the admin screen and
 * opened elsewhere for the life of the link. Here the link is made and spent on the server, the bytes
 * are streamed back, and every view re-checks the session against the database.
 *
 * 404 FOR EVERYTHING THAT IS NOT A HIT - no session, not an admin, no such member, no such side - so
 * this cannot be used to discover which members have submitted a CNIC.
 */

const SIDES = { front: "front", back: "back" } as const;

interface RouteContext {
  params: Promise<{ userId: string; side: string }>;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const admin = await getActiveAdmin();

  if (!admin) {
    return notFound();
  }

  const { userId, side } = await params;

  if (!(side in SIDES) || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
    return notFound();
  }

  const document = await prisma.identityDocument.findUnique({
    where: { userId },
    select: {
      frontPublicId: true,
      frontFormat: true,
      backPublicId: true,
      backFormat: true,
    },
  });

  if (!document) {
    return notFound();
  }

  const [publicId, format] =
    side === SIDES.front
      ? [document.frontPublicId, document.frontFormat]
      : [document.backPublicId, document.backFormat];

  let upstream: Response;

  try {
    upstream = await fetch(privateDownloadUrl(publicId, format), {
      cache: "no-store",
    });
  } catch (error) {
    console.error("identity document fetch failed", error);

    return new Response("Could not load the image.", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`identity document fetch returned ${upstream.status}`);

    return new Response("Could not load the image.", { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      // Never stored by the browser, a proxy or a CDN: an identity document is looked at, not kept.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
