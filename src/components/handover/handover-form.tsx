"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";

import { ImageUploader } from "@/components/listings/image-uploader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HandoverCondition, HandoverType } from "@/generated/prisma/enums";
import {
  HANDOVER_CONDITION_DESCRIPTIONS,
  HANDOVER_CONDITION_LABELS,
  HANDOVER_NOTES_MAX,
  HANDOVER_PHOTOS_MAX,
  HANDOVER_PROMPTS,
} from "@/lib/handover/rules";

import type { ListingImageInput } from "@/lib/validations/listing";

interface HandoverFormProps {
  type: HandoverType;
  /** Label for the submit button - the transition it completes, in the owner's words. */
  submitLabel: string;
  isPending: boolean;
  onSubmit: (record: {
    condition: HandoverCondition;
    notes?: string;
    photoIds?: string[];
  }) => void;
  onCancel: () => void;
}

/**
 * Recording the condition of an item as it changes hands.
 *
 * NO CONDITION IS PRESELECTED, for the same reason no star is preselected on the review form. A
 * default of "as expected" would be answered by inertia by every owner in a hurry, and the record
 * would then say what the form said rather than what the person saw - which is worse than no record,
 * because it looks like evidence.
 *
 * PHOTOS ARE OPTIONAL BUT PROMPTED. Requiring them would leave two people stuck in a doorway with a
 * failing camera permission and no way to finish the rental. Prompting for them when the condition
 * is anything other than as-expected is where they actually matter.
 *
 * Only public ids are submitted. The browser keeps the URL for previews because it has just uploaded
 * the file, but the server derives every stored URL from Cloudinary - see `resolveHandoverPhotos`.
 */
function HandoverForm({
  type,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: HandoverFormProps) {
  const [condition, setCondition] = useState<HandoverCondition | null>(null);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<ListingImageInput[]>([]);

  const wantsPhotos =
    condition !== null && condition !== HandoverCondition.AS_EXPECTED;

  function submit() {
    if (!condition) {
      return;
    }

    onSubmit({
      condition,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(photos.length > 0
        ? { photoIds: photos.map((photo) => photo.publicId) }
        : {}),
    });
  }

  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3">
      <p className="text-xs font-medium">{HANDOVER_PROMPTS[type]}</p>

      <div
        role="radiogroup"
        aria-label="Item condition"
        className="flex flex-col gap-1.5"
      >
        {Object.values(HandoverCondition).map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-2 text-sm"
          >
            <input
              type="radio"
              name={`handover-condition-${type}`}
              value={value}
              checked={condition === value}
              onChange={() => setCondition(value)}
              disabled={isPending}
              className="accent-primary mt-1 size-3.5 shrink-0"
            />
            <span>
              <span className="font-medium">
                {HANDOVER_CONDITION_LABELS[value]}
              </span>
              <span className="text-muted-foreground block text-xs leading-relaxed">
                {HANDOVER_CONDITION_DESCRIPTIONS[value]}
              </span>
            </span>
          </label>
        ))}
      </div>

      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={HANDOVER_NOTES_MAX}
        rows={2}
        placeholder="Optional — anything worth noting about the item's state"
        disabled={isPending}
        aria-label="Condition notes"
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          Photos {wantsPhotos ? "(strongly recommended)" : "(optional)"}
        </span>
        <ImageUploader
          images={photos}
          onChange={setPhotos}
          max={HANDOVER_PHOTOS_MAX}
        />
      </div>

      {/*
        Says plainly that the record cannot be edited. Someone who learns that afterwards, when it
        already matters, has been misled by silence - and the whole value of the record rests on it
        being unchangeable.
      */}
      <p className="text-muted-foreground text-xs leading-relaxed">
        This is saved as a permanent record and cannot be edited afterwards. The
        other party is asked to confirm it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={isPending || condition === null}
          aria-busy={isPending}
        >
          {isPending && <Loader2Icon className="animate-spin" />}
          {submitLabel}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export { HandoverForm };
