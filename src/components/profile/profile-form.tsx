"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { updateProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAKISTANI_CITIES } from "@/config/cities";
import {
  BIO_MAX,
  profileFormSchema,
  toUpdateProfileInput,
} from "@/lib/validations/profile";

import type { ProfileFormValues } from "@/lib/validations/profile";

/** Matches `Input`'s tokens so the native select sits flush beside one. */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-visible:ring-3";

interface ProfileFormProps {
  /** Current values, straight from the database rather than the session. */
  defaults: ProfileFormValues;
}

/**
 * The member's own name, bio, city and phone number.
 *
 * ONE FORM, FOUR FIELDS, AND TWO AUDIENCES. Name, bio and city are on `/users/[id]` for
 * anyone to read; the phone number is on no public query at all. That is not obvious
 * from looking at a form, so each field says which it is - a member choosing what to
 * write needs to know before they write it, not after.
 *
 * Values are seeded from the page's database read, not from the session: the JWT's copy
 * of `name` is up to 24h old, so a form defaulted from it could silently re-save a stale
 * name over a newer one.
 *
 * `isDirty` gates the submit button, which also gates the reload warning. Both come from
 * the same fact - that there is something to lose - and a Save button that is live when
 * nothing has changed invites a pointless write.
 */
function ProfileForm({ defaults }: ProfileFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: defaults,
  });

  const { errors, isSubmitting, isDirty } = form.formState;
  const bio = form.watch("bio");

  async function onSubmit(values: ProfileFormValues) {
    setFormError(null);

    const result = await updateProfile(toUpdateProfileInput(values));

    if (!result.success) {
      setFormError(result.error);

      return;
    }

    /**
     * Reset to the SUBMITTED values, not to `defaults`.
     *
     * This is what clears `isDirty` - without it the form stays dirty after a successful
     * save, the button remains live and the member is invited to save again. Resetting to
     * `defaults` would be worse still: it would visibly revert the fields they just saved,
     * since the prop is a snapshot from the render before the write.
     */
    form.reset(values);

    toast.success("Profile updated.");

    // The header avatar and name are rendered by the layout, which the action has already
    // revalidated; this is what makes the current page pick that up without a navigation.
    router.refresh();
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      {formError && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formError}
        </div>
      )}

      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">Display name</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            disabled={isSubmitting}
            {...form.register("name")}
          />
          <FieldDescription>
            Shown on your listings, your reviews and your public profile.
          </FieldDescription>
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={Boolean(errors.bio)}>
          <FieldLabel htmlFor="bio">Bio (optional)</FieldLabel>
          <Textarea
            id="bio"
            rows={4}
            placeholder="A line or two about what you rent out, and how you like to arrange handovers."
            aria-invalid={Boolean(errors.bio)}
            disabled={isSubmitting}
            {...form.register("bio")}
          />
          <FieldDescription>
            Public. {bio.length} of {BIO_MAX} characters.
          </FieldDescription>
          <FieldError errors={[errors.bio]} />
        </Field>

        <Field data-invalid={Boolean(errors.city)}>
          <FieldLabel htmlFor="city">City (optional)</FieldLabel>
          <select
            id="city"
            className={SELECT_CLASS}
            aria-invalid={Boolean(errors.city)}
            disabled={isSubmitting}
            {...form.register("city")}
          >
            <option value="">Not set</option>
            {PAKISTANI_CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>
          <FieldDescription>
            Public. Where you usually hand items over - a listing sets its own
            city, so this does not change any listing you have already posted.
          </FieldDescription>
          <FieldError errors={[errors.city]} />
        </Field>

        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="phone">Phone number (optional)</FieldLabel>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0300 1234567"
            aria-invalid={Boolean(errors.phone)}
            disabled={isSubmitting}
            {...form.register("phone")}
          />
          <FieldDescription>
            Private - never shown on your profile or your listings. Pakistani
            mobile numbers only.
          </FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>
      </FieldGroup>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? (
            <>
              <Loader2Icon className="animate-spin" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}

export { ProfileForm };
