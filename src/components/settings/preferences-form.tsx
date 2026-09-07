"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { updatePreferences } from "@/actions/preferences";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { PAKISTANI_CITIES } from "@/config/cities";
import {
  preferencesFormSchema,
  toUpdatePreferencesInput,
} from "@/lib/validations/preferences";

import type { PreferencesFormValues } from "@/lib/validations/preferences";
import type { Control } from "react-hook-form";

/** Matches `Input`'s tokens so the native select sits flush beside one. */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-visible:ring-3";

interface PreferencesFormProps {
  defaults: PreferencesFormValues;
}

/**
 * Browsing and notification preferences.
 *
 * The two switches go through `Controller` rather than `register`, because a Base UI
 * Switch reports its state through `onCheckedChange` with a boolean and has no
 * `event.target.value` for React Hook Form's native registration to read.
 *
 * `isDirty` gates Save, so the button is never live when there is nothing to write, and
 * the form resets to the submitted values on success - without that it stays dirty after
 * saving and invites a pointless second write.
 */
function PreferencesForm({ defaults }: PreferencesFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesFormSchema),
    defaultValues: defaults,
  });

  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: PreferencesFormValues) {
    setFormError(null);

    const result = await updatePreferences(toUpdatePreferencesInput(values));

    if (!result.success) {
      setFormError(result.error);

      return;
    }

    form.reset(values);

    toast.success("Preferences saved.");

    // The default city decides where a bare `/listings` sends this member, and that is
    // resolved on the server - so the Router Cache has to be refreshed or the next visit
    // to browse uses the old answer.
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
        <Field data-invalid={Boolean(errors.defaultCity)}>
          <FieldLabel htmlFor="defaultCity">Default city</FieldLabel>
          <select
            id="defaultCity"
            className={SELECT_CLASS}
            aria-invalid={Boolean(errors.defaultCity)}
            disabled={isSubmitting}
            {...form.register("defaultCity")}
          >
            <option value="">No preference - show everywhere</option>
            {PAKISTANI_CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>
          <FieldDescription>
            Where browsing starts. Opening Listings takes you to this city, and
            you can still switch to any other city, or to all of them, from the
            filters.
          </FieldDescription>
          <FieldError errors={[errors.defaultCity]} />
        </Field>
      </FieldGroup>

      <fieldset className="flex flex-col gap-4 border-t pt-4">
        <legend className="sr-only">Notifications</legend>

        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-sm font-medium">Notifications</h3>
          <p className="text-muted-foreground text-xs">
            Everything else SamaanShare sends - booking requests, approvals,
            payments, deposit claims - cannot be switched off. Each one is the
            only record you get of something changing about your money or your
            rentals.
          </p>
        </div>

        <SwitchField
          control={form.control}
          name="notifyReviewReminders"
          label="Review reminders"
          description="A nudge to review the other person after a rental finishes."
          disabled={isSubmitting}
        />

        <SwitchField
          control={form.control}
          name="notifyReviewPublished"
          label="Review published"
          description="Tells you when your review and theirs both go public."
          disabled={isSubmitting}
        />
      </fieldset>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? (
            <>
              <Loader2Icon className="animate-spin" />
              Saving...
            </>
          ) : (
            "Save preferences"
          )}
        </Button>
      </div>
    </form>
  );
}

interface SwitchFieldProps {
  control: Control<PreferencesFormValues>;
  /** Only the boolean fields, so a `<select>` cannot be wired to a switch. */
  name: "notifyReviewReminders" | "notifyReviewPublished";
  label: string;
  description: string;
  disabled: boolean;
}

/**
 * One labelled switch row.
 *
 * The label uses `htmlFor` against the Switch's own id so the whole label is a hit target,
 * and the description is tied on with `aria-describedby` rather than left as loose text -
 * "Review reminders, on" alone does not say what would stop arriving.
 */
function SwitchField({
  control,
  name,
  label,
  description,
  disabled,
}: SwitchFieldProps) {
  const descriptionId = `${name}-description`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <label htmlFor={name} className="text-sm font-medium">
              {label}
            </label>
            <p id={descriptionId} className="text-muted-foreground text-xs">
              {description}
            </p>
          </div>

          <Switch
            id={name}
            checked={field.value}
            onCheckedChange={field.onChange}
            disabled={disabled}
            aria-describedby={descriptionId}
            className="mt-0.5 shrink-0"
          />
        </div>
      )}
    />
  );
}

export { PreferencesForm };
