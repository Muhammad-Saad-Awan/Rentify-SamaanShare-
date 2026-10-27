import { isCloudinaryEnabled } from "@/config/env";
import { IdentityDocumentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * The CNIC requirement: a member must have submitted their CNIC before they request a rental or
 * publish a listing.
 *
 * SUBMITTED, NOT APPROVED. Review is a human working through a queue, and gating the marketplace on
 * it would make every new member wait on an administrator before doing anything at all. A PENDING
 * document is enough; a REJECTED one is not, because the member has been told what to fix.
 *
 * SWITCHED OFF WHERE IT CANNOT BE MET, like the email gate. Uploading needs Cloudinary; on a
 * deployment without it nobody could ever clear this, and a requirement nobody can meet is an outage
 * rather than a safety feature - see property 1 in `lib/trust/access.ts`.
 */
export function isIdentityDocumentRequired(): boolean {
  return isCloudinaryEnabled();
}

/** Refusal for the listing flow, matching the tone of `EMAIL_CONFIRMATION_REQUIRED_ERROR`. */
export const IDENTITY_DOCUMENT_REQUIRED_ERROR =
  "Please upload your CNIC first. You can add it from your profile - it takes a minute.";

/** Whether this member's submission currently counts: on file and not rejected. */
export function isDocumentAccepted(
  status: IdentityDocumentStatus | null | undefined
): boolean {
  return (
    status === IdentityDocumentStatus.PENDING ||
    status === IdentityDocumentStatus.APPROVED
  );
}

/** Whether this member still has to upload their CNIC before renting or listing. */
export async function needsIdentityDocument(userId: string): Promise<boolean> {
  if (!isIdentityDocumentRequired()) {
    return false;
  }

  const document = await prisma.identityDocument.findUnique({
    where: { userId },
    select: { status: true },
  });

  return !isDocumentAccepted(document?.status);
}
