"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { updatePreferences } from "@/actions/preferences";
import { FormAlert } from "@/components/ui/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { PAKISTANI_CITIES } from "@/config/cities";
import {
  preferencesFormSchema,
  toUpdatePreferencesInput,
} from "@/lib/validations/preferences";

import type { PreferencesFormValues } from "@/lib/validations/preferences";
import type { Control } from "react-hook-form";

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
      {formError && <FormAlert tone="error">{formError}</FormAlert>}

      <FieldGroup>
        <Field data-invalid={Boolean(errors.defaultCity)}>
          <FieldLabel htmlFor="defaultCity">Default city</FieldLabel>
          <NativeSelect
            id="defaultCity"
            className="sm:max-w-sm"
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
          </NativeSelect>
          <FieldDescription>
            Where browsing starts. Opening Listings takes you to this city, and
            you can still switch to any other city, or to all of them, from the
            filters.
          </FieldDescription>
          <FieldError errors={[errors.defaultCity]} />
        </Field>
      </FieldGroup>

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="sr-only">Notifications</legend>

        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-base font-semibold tracking-tight">
            Notifications
          </h3>
          <p className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed">
            Everything else SamaanShare sends - booking requests, approvals,
            payments, deposit claims - cannot be switched off. Each one is the
            only record you get of something changing about your money or your
            rentals.
          </p>
        </div>

        <div className="divide-y rounded-lg border">
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
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-end">
        {!isDirty && !isSubmitting && (
          <p className="text-muted-foreground text-xs">No unsaved changes.</p>
        )}
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={isSubmitting || !isDirty}
        >
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
 *
 * `aria-labelledby` AS WELL AS `htmlFor`, WHICH LOOKS REDUNDANT AND IS NOT. Base UI's Switch
 * renders a `<span role="switch">` alongside a hidden `<input>`, and `id` lands on the input.
 * So `htmlFor` names the input - which is real, and is not the element assistive technology
 * reports - while the switch itself had no accessible name at all, announcing as "switch, on"
 * with nothing to say what was on. axe caught this on the first signed-in scan
 * (`aria-toggle-field-name`, serious); reading the source did not, because the markup looked
 * correct and the gap was in what the primitive renders underneath.
 */
function SwitchField({
  control,
  name,
  label,
  description,
  disabled,
}: SwitchFieldProps) {
  const descriptionId = `${name}-description`;
  const labelId = `${name}-label`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label id={labelId} htmlFor={name} className="text-sm font-medium">
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
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            className="mt-0.5 shrink-0"
          />
        </div>
      )}
    />
  );
}

export { PreferencesForm };
