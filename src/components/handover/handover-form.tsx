"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";

import { ImageUploader } from "@/components/listings/image-uploader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HandoverCondition, HandoverType } from "@/generated/prisma/enums";
import { useFocusOnMount } from "@/hooks/use-focus-on-mount";
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
 * the file, but the server derives every stored URL from Cloudinary - see `resolveOwnedPhotos`.
 */
function HandoverForm({
  type,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: HandoverFormProps) {
  const promptId = useId();
  const notesId = useId();
  const blockedId = useId();

  /**
   * This panel replaces the button that opened it, so without moving focus the person who opened
   * it is left focused on nothing. The container takes it rather than the first radio: focusing a
   * radio inside a group arms the arrow keys, and one keystroke would then commit a condition to
   * a record that cannot be edited afterwards.
   */
  const panel = useFocusOnMount<HTMLDivElement>();

  const [condition, setCondition] = useState<HandoverCondition | null>(null);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<ListingImageInput[]>([]);

  const wantsPhotos =
    condition !== null && condition !== HandoverCondition.AS_EXPECTED;

  /** Nothing is preselected, so the form opens in a state that cannot yet be submitted. */
  const needsCondition = condition === null;

  function submit() {
    /**
     * `isPending` is guarded HERE, not only on the button.
     *
     * The button is `aria-disabled` rather than `disabled` so it keeps its place in the tab
     * order and can explain itself - but an `aria-disabled` button still fires, so whatever the
     * old `disabled` was protecting against has to move into the handler. Here that is a second
     * submission during the first: the database refuses it, `@@unique([bookingId, type])` being
     * the whole point of a sealed record, but the user would be shown a failure for pressing a
     * button twice.
     */
    if (isPending || !condition) {
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
    <div
      ref={panel}
      // Focusable only programmatically: it is a destination for focus, never a tab stop.
      tabIndex={-1}
      role="group"
      aria-labelledby={promptId}
      className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3"
    >
      <p id={promptId} className="text-xs font-medium">
        {HANDOVER_PROMPTS[type]}
      </p>

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

      {/*
        A visible label, not an `aria-label`. The field sits between a radio group and a photo
        picker with nothing else naming it, and an accessible name only a screen reader can
        perceive leaves every sighted user to infer what the box is for from its placeholder -
        which disappears the moment they type.
      */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={notesId} className="text-xs font-medium">
          Notes (optional)
        </label>
        <Textarea
          id={notesId}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={HANDOVER_NOTES_MAX}
          rows={2}
          placeholder="Anything worth noting about the item's state"
          disabled={isPending}
        />
      </div>

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
        {/*
          `aria-disabled` with a reason attached, rather than `disabled` on its own. An unusable
          button that does not say why is heard as "unavailable" and nothing else, leaving the
          one thing standing in the way - an unanswered question directly above - to be guessed
          at. `submit()` refuses a missing condition regardless.
        */}
        <Button
          size="sm"
          onClick={submit}
          aria-disabled={isPending || needsCondition}
          {...(needsCondition ? { "aria-describedby": blockedId } : {})}
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

      {needsCondition && (
        <p id={blockedId} className="text-muted-foreground text-xs">
          Choose a condition above to continue.
        </p>
      )}
    </div>
  );
}

export { HandoverForm };
