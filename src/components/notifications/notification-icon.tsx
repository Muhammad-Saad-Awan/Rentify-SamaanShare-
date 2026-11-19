import {
  BadgeCheckIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarXIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClipboardListIcon,
  FlagIcon,
  IdCardIcon,
  InboxIcon,
  KeyRoundIcon,
  PackageCheckIcon,
  RotateCcwIcon,
  ScaleIcon,
  StarIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";

import { NotificationType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";

import type { LucideIcon } from "lucide-react";

/**
 * How a notification reads at a glance, before its title is read.
 *
 * - `positive`: something settled in the reader's favour - approved, paid, returned, verified.
 *   The one place a notification spends emerald.
 * - `attention`: the reader is expected to do something - answer a request, pay, respond to a
 *   claim. Warning-soft, never red: nothing has gone wrong yet.
 * - `negative`: a refusal or a reversal.
 * - `neutral`: everything else - a record of something that happened.
 *
 * The tone only reinforces. The icon differs by kind of event and the title says what happened,
 * so a reader who cannot tell the tints apart loses nothing.
 */
type Tone = "positive" | "attention" | "negative" | "neutral";

/**
 * Exhaustive on purpose: a `Record` over the enum, so a new notification type fails the type check
 * here instead of quietly falling back to a bell.
 */
const BY_TYPE: Record<NotificationType, { icon: LucideIcon; tone: Tone }> = {
  [NotificationType.BOOKING_REQUESTED]: { icon: InboxIcon, tone: "attention" },
  [NotificationType.BOOKING_APPROVED]: {
    icon: CalendarCheckIcon,
    tone: "positive",
  },
  [NotificationType.BOOKING_DECLINED]: {
    icon: CalendarXIcon,
    tone: "negative",
  },
  [NotificationType.BOOKING_CANCELLED]: {
    icon: CalendarXIcon,
    tone: "neutral",
  },
  [NotificationType.BOOKING_EXPIRED]: {
    icon: CalendarClockIcon,
    tone: "neutral",
  },
  [NotificationType.PAYMENT_PENDING]: { icon: WalletIcon, tone: "attention" },
  [NotificationType.PAYMENT_CONFIRMED]: {
    icon: CircleCheckIcon,
    tone: "positive",
  },
  [NotificationType.BOOKING_ACTIVE]: { icon: KeyRoundIcon, tone: "neutral" },
  [NotificationType.BOOKING_COMPLETED]: {
    icon: PackageCheckIcon,
    tone: "neutral",
  },
  [NotificationType.DEPOSIT_RETURNED]: {
    icon: RotateCcwIcon,
    tone: "positive",
  },
  [NotificationType.REVIEW_RECEIVED]: { icon: StarIcon, tone: "neutral" },
  [NotificationType.REVIEW_REMINDER]: { icon: StarIcon, tone: "attention" },
  [NotificationType.REPORT_RESOLVED]: { icon: FlagIcon, tone: "neutral" },
  [NotificationType.HANDOVER_DISPUTED]: {
    icon: TriangleAlertIcon,
    tone: "attention",
  },
  [NotificationType.CLAIM_FILED]: { icon: ScaleIcon, tone: "attention" },
  [NotificationType.CLAIM_RESPONDED]: { icon: ScaleIcon, tone: "attention" },
  [NotificationType.CLAIM_RESOLVED]: { icon: ScaleIcon, tone: "neutral" },
  [NotificationType.BOOKING_INSTRUCTIONS_UPDATED]: {
    icon: ClipboardListIcon,
    tone: "neutral",
  },
  [NotificationType.PAYMENT_REJECTED]: { icon: CircleXIcon, tone: "negative" },
  [NotificationType.PAYMENT_VERIFICATION_REVERSED]: {
    icon: CircleXIcon,
    tone: "negative",
  },
  [NotificationType.BOOKING_SETTLED]: {
    icon: CircleCheckIcon,
    tone: "positive",
  },
  [NotificationType.OWNER_PAID]: { icon: BanknoteIcon, tone: "positive" },
  [NotificationType.REFUND_RECORDED]: { icon: BanknoteIcon, tone: "neutral" },
  [NotificationType.IDENTITY_VERIFIED]: {
    icon: BadgeCheckIcon,
    tone: "positive",
  },
  [NotificationType.IDENTITY_DOCUMENT_REJECTED]: {
    icon: IdCardIcon,
    tone: "negative",
  },
};

const TONE_CLASS: Record<Tone, string> = {
  positive: "bg-success-soft text-success-soft-foreground",
  attention: "bg-warning-soft text-warning-soft-foreground",
  negative: "bg-destructive/8 text-destructive",
  neutral: "bg-muted text-foreground",
};

interface NotificationIconProps {
  type: NotificationType;
  className?: string;
}

/**
 * The tile at the start of a notification row - shared by the header panel and the inbox page, so
 * one event looks the same in both. Decorative: the row's title carries the meaning.
 */
function NotificationIcon({ type, className }: NotificationIconProps) {
  const { icon: Icon, tone } = BY_TYPE[type];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        TONE_CLASS[tone],
        className
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

export { NotificationIcon };
