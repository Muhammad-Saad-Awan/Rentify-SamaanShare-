"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createListing } from "@/actions/listings";
import { ImageUploader } from "@/components/listings/image-uploader";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PAKISTANI_CITIES } from "@/config/cities";
import { ItemCondition } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";
import { formatPKR } from "@/lib/utils/currency";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";
import {
  DESCRIPTION_MAX,
  listingFormSchema,
  toCreateListingInput,
} from "@/lib/validations/listing";

import type { CategoryOption } from "@/lib/queries/categories";
import type { ListingFormValues } from "@/lib/validations/listing";

/** Matches `Input`'s tokens so native selects sit flush beside one. */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-visible:ring-3";

/**
 * The steps, and which fields each one owns.
 *
 * The field lists are what "Next" validates - `form.trigger(fields)` checks only
 * these, so a later step's empty required field cannot block an earlier one. They are
 * declared here rather than inline so a field added to a step cannot be forgotten by
 * the validation call.
 */
const STEPS = [
  {
    title: "Basics",
    fields: [
      "title",
      "description",
      "categorySlug",
      "subcategorySlug",
      "condition",
    ],
  },
  {
    title: "Pricing",
    fields: ["pricePerDay", "pricePerWeek", "pricePerMonth", "securityDeposit"],
  },
  { title: "Location", fields: ["city", "area"] },
  { title: "Photos", fields: ["images"] },
  { title: "Review", fields: [] },
] as const satisfies readonly {
  title: string;
  fields: readonly (keyof ListingFormValues)[];
}[];

interface CreateListingFormProps {
  categories: readonly CategoryOption[];
}

/**
 * Multi-step listing form.
 *
 * ONE `useForm` across all five steps rather than a form per step. Every value stays
 * mounted in a single state object, so moving backwards keeps what was typed and the
 * review step can read the whole thing without any cross-step plumbing. The steps are
 * a rendering concern, not a data one.
 *
 * Validation is per step on "Next" and again over everything on submit - and a third
 * time on the server, which is the only check that counts.
 */
function CreateListingForm({ categories }: CreateListingFormProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    // Every field gets an explicit initial value, including the empty strings. An
    // undefined default makes React Hook Form treat the input as uncontrolled and
    // React warns the first time a value arrives.
    defaultValues: {
      title: "",
      description: "",
      categorySlug: "",
      subcategorySlug: "",
      condition: ItemCondition.GOOD,
      pricePerDay: "",
      pricePerWeek: "",
      pricePerMonth: "",
      securityDeposit: "",
      city: "",
      area: "",
      images: [],
    },
  });

  const { errors, isSubmitting } = form.formState;

  const values = form.watch();
  // `?? STEPS[0]` satisfies noUncheckedIndexedAccess. `stepIndex` is clamped by both
  // navigation handlers, so the fallback is unreachable rather than a real branch.
  const step = STEPS[stepIndex] ?? STEPS[0];
  const isLastStep = stepIndex === STEPS.length - 1;

  /**
   * Warns before a reload or tab close discards the form.
   *
   * Uploaded photos are the real cost: they are already in Cloudinary but only this
   * page holds the ids, so navigating away orphans the files AND loses the work. The
   * browser shows its own generic dialog - the string is ignored by every modern
   * engine, and returning a value is what triggers the prompt.
   *
   * Only armed once something is at stake, so it never nags on an untouched form.
   */
  const hasUnsavedWork = form.formState.isDirty || values.images.length > 0;

  useEffect(() => {
    if (!hasUnsavedWork || form.formState.isSubmitSuccessful) {
      return;
    }

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork, form.formState.isSubmitSuccessful]);

  /**
   * Subcategories for the chosen category, recomputed as it changes.
   *
   * Worth contrasting with the browse filter sidebar, which cannot do this: that form
   * is deliberately JavaScript-free, so its subcategory list only updates on a
   * round trip. Here there is already a client bundle, so the dependent select can be
   * live.
   */
  const activeCategory = categories.find(
    (category) => category.slug === values.categorySlug
  );

  async function goNext() {
    setFormError(null);

    const valid = await form.trigger([...step.fields]);

    if (!valid) {
      return;
    }

    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }

  function goBack() {
    setFormError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  /**
   * Sends the user to the earliest step containing an error.
   *
   * Submit validates the whole schema, so a field left invalid on step two can fail a
   * submission made from the review step - where the message appears in a banner with
   * nothing on screen to fix. Without this the form is a dead end: an error is shown
   * for a field the user cannot see.
   */
  function goToFirstErrorStep() {
    const failed = STEPS.findIndex((candidate) =>
      candidate.fields.some((field) => field in form.formState.errors)
    );

    if (failed >= 0) {
      setStepIndex(failed);
    }
  }

  async function onSubmit(submitted: ListingFormValues) {
    setFormError(null);

    const result = await createListing(toCreateListingInput(submitted));

    if (!result.success) {
      setFormError(result.error);

      return;
    }

    toast.success("Your listing is live.");

    // `push`, not `replace`: the form is a legitimate previous page, and someone who
    // immediately wants to list a similar item expects Back to return here.
    router.push(`/listings/${result.data.id}`);
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, goToFirstErrorStep)}
      className="flex flex-col gap-6"
      noValidate
    >
      <StepIndicator current={stepIndex} />

      {formError && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formError}
        </div>
      )}

      {stepIndex === 0 && (
        <FieldGroup>
          <Field data-invalid={Boolean(errors.title)}>
            <FieldLabel htmlFor="title">Title</FieldLabel>
            <Input
              id="title"
              placeholder="Canon EOS R6 with 24-105mm lens"
              aria-invalid={Boolean(errors.title)}
              disabled={isSubmitting}
              {...form.register("title")}
            />
            <FieldDescription>
              What the item is, as a renter would search for it.
            </FieldDescription>
            <FieldError errors={[errors.title]} />
          </Field>

          <Field data-invalid={Boolean(errors.description)}>
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <textarea
              id="description"
              rows={6}
              placeholder="Condition, what is included, and anything a renter should know."
              aria-invalid={Boolean(errors.description)}
              disabled={isSubmitting}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-3"
              {...form.register("description")}
            />
            <FieldDescription>
              {/* Live count, so the limit is discovered before submitting. */}
              {values.description.length} / {DESCRIPTION_MAX} characters.
            </FieldDescription>
            <FieldError errors={[errors.description]} />
          </Field>

          <Field data-invalid={Boolean(errors.categorySlug)}>
            <FieldLabel htmlFor="categorySlug">Category</FieldLabel>
            <select
              id="categorySlug"
              className={SELECT_CLASS}
              aria-invalid={Boolean(errors.categorySlug)}
              disabled={isSubmitting}
              {...form.register("categorySlug", {
                // Clearing the subcategory is required, not cosmetic: keeping a
                // subcategory from the previous category would submit a pair the
                // server rejects, and the error would point at a field the user
                // never touched.
                onChange: () => form.setValue("subcategorySlug", ""),
              })}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError errors={[errors.categorySlug]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="subcategorySlug">
              Subcategory (optional)
            </FieldLabel>
            <select
              id="subcategorySlug"
              className={cn(SELECT_CLASS, "disabled:opacity-50")}
              disabled={isSubmitting || !activeCategory}
              {...form.register("subcategorySlug")}
            >
              <option value="">
                {activeCategory
                  ? `Any ${activeCategory.name}`
                  : "Choose a category first"}
              </option>
              {activeCategory?.subcategories.map((subcategory) => (
                <option key={subcategory.slug} value={subcategory.slug}>
                  {subcategory.name}
                </option>
              ))}
            </select>
            <FieldError errors={[errors.subcategorySlug]} />
          </Field>

          <Field data-invalid={Boolean(errors.condition)}>
            <FieldLabel htmlFor="condition">Condition</FieldLabel>
            <select
              id="condition"
              className={SELECT_CLASS}
              aria-invalid={Boolean(errors.condition)}
              disabled={isSubmitting}
              {...form.register("condition")}
            >
              {Object.values(ItemCondition).map((condition) => (
                <option key={condition} value={condition}>
                  {CONDITION_LABELS[condition]}
                </option>
              ))}
            </select>
            <FieldError errors={[errors.condition]} />
          </Field>
        </FieldGroup>
      )}

      {stepIndex === 1 && (
        <FieldGroup>
          <PriceField
            name="pricePerDay"
            label="Price per day (PKR)"
            description="What one day costs. Required."
            error={errors.pricePerDay?.message}
            disabled={isSubmitting}
            register={form.register}
          />

          <PriceField
            name="pricePerWeek"
            label="Price per week (optional)"
            description="Leave blank if you only rent by the day."
            error={errors.pricePerWeek?.message}
            disabled={isSubmitting}
            register={form.register}
          />

          <PriceField
            name="pricePerMonth"
            label="Price per month (optional)"
            description="Leave blank if you do not offer monthly rentals."
            error={errors.pricePerMonth?.message}
            disabled={isSubmitting}
            register={form.register}
          />

          <PriceField
            name="securityDeposit"
            label="Security deposit (PKR)"
            description="Refunded when the item comes back. Enter 0 for none."
            error={errors.securityDeposit?.message}
            disabled={isSubmitting}
            register={form.register}
          />
        </FieldGroup>
      )}

      {stepIndex === 2 && (
        <FieldGroup>
          <Field data-invalid={Boolean(errors.city)}>
            <FieldLabel htmlFor="city">City</FieldLabel>
            <select
              id="city"
              className={SELECT_CLASS}
              aria-invalid={Boolean(errors.city)}
              disabled={isSubmitting}
              {...form.register("city")}
            >
              <option value="">Choose a city</option>
              {PAKISTANI_CITIES.map((city) => (
                <option key={city.value} value={city.value}>
                  {city.label}
                </option>
              ))}
            </select>
            <FieldDescription>
              SamaanShare is live in three cities to start with.
            </FieldDescription>
            <FieldError errors={[errors.city]} />
          </Field>

          <Field data-invalid={Boolean(errors.area)}>
            <FieldLabel htmlFor="area">Area (optional)</FieldLabel>
            <Input
              id="area"
              placeholder="DHA Phase 6, Gulberg III, F-11"
              aria-invalid={Boolean(errors.area)}
              disabled={isSubmitting}
              {...form.register("area")}
            />
            <FieldDescription>
              Helps renters judge distance. Do not put your full address here -
              it is shown publicly.
            </FieldDescription>
            <FieldError errors={[errors.area]} />
          </Field>
        </FieldGroup>
      )}

      {stepIndex === 3 && (
        <ImageUploader
          images={values.images}
          onChange={(next) =>
            // `shouldValidate` so removing the last photo surfaces the "at least one"
            // error immediately rather than at the next step change.
            form.setValue("images", next, { shouldValidate: true })
          }
          error={errors.images?.message}
        />
      )}

      {isLastStep && <ReviewStep values={values} categories={categories} />}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={stepIndex === 0 || isSubmitting}
        >
          Back
        </Button>

        {isLastStep ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2Icon className="animate-spin" />
                Publishing...
              </>
            ) : (
              "Publish listing"
            )}
          </Button>
        ) : (
          // `type="button"`, so Enter in a text field does not submit a half-filled
          // form from step one.
          <Button type="button" onClick={() => void goNext()}>
            Continue
          </Button>
        )}
      </div>
    </form>
  );
}

interface StepIndicatorProps {
  current: number;
}

/**
 * Progress through the steps.
 *
 * An ordered list, so the sequence survives with styles off, and each step carries
 * `aria-current` on the active one - the ring colour alone conveys nothing to a
 * screen reader.
 */
function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <nav aria-label="Listing steps">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {STEPS.map((step, index) => {
          const isDone = index < current;
          const isCurrent = index === current;

          return (
            <li key={step.title} className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                  isCurrent && "bg-primary text-primary-foreground",
                  isDone && "bg-muted text-foreground",
                  !isCurrent && !isDone && "text-muted-foreground"
                )}
              >
                {isDone ? (
                  <CheckIcon className="size-3" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">{index + 1}</span>
                )}
                {step.title}
                {isDone && <span className="sr-only">(completed)</span>}
              </span>

              {index < STEPS.length - 1 && (
                <span className="text-muted-foreground" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface PriceFieldProps {
  name: "pricePerDay" | "pricePerWeek" | "pricePerMonth" | "securityDeposit";
  label: string;
  description: string;
  error: string | undefined;
  disabled: boolean;
  register: ReturnType<typeof useForm<ListingFormValues>>["register"];
}

/**
 * One rupee amount.
 *
 * `type="text"` with a numeric `inputMode` rather than `type="number"`: a number input
 * silently accepts `1e5` and `1.5`, exposes spinners that make a mis-scroll change the
 * price, and reports an empty string for invalid content - so the schema could not tell
 * "blank" from "not a number". Digits are enforced by the schema instead.
 */
function PriceField({
  name,
  label,
  description,
  error,
  disabled,
  register,
}: PriceFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        aria-invalid={Boolean(error)}
        disabled={disabled}
        {...register(name)}
      />
      <FieldDescription>{description}</FieldDescription>
      {error && <FieldError errors={[{ message: error }]} />}
    </Field>
  );
}

interface ReviewStepProps {
  values: ListingFormValues;
  categories: readonly CategoryOption[];
}

/**
 * Read-only summary before publishing.
 *
 * Reads from the same watched values the inputs write to, so there is nothing to keep
 * in sync - what is shown here is exactly what will be submitted. Amounts are run
 * through `formatPKR`, so a mistyped extra zero is visible as "Rs. 65,000" rather than
 * hiding in a raw input.
 */
function ReviewStep({ values, categories }: ReviewStepProps) {
  const money = (raw: string): string => {
    const trimmed = raw.trim();

    return trimmed === "" ? "-" : formatPKR(Number(trimmed));
  };

  const category = categories.find(
    (entry) => entry.slug === values.categorySlug
  );
  const subcategory = category?.subcategories.find(
    (entry) => entry.slug === values.subcategorySlug
  );

  const rows: { label: string; value: string }[] = [
    { label: "Title", value: values.title },
    { label: "Category", value: category?.name ?? "-" },
    ...(subcategory ? [{ label: "Subcategory", value: subcategory.name }] : []),
    { label: "Condition", value: CONDITION_LABELS[values.condition] },
    // Trimmed before the truthiness test: a whitespace-only optional is truthy but
    // converts to 0, which would advertise a free weekly rate on the review screen
    // while `toCreateListingInput` correctly omits it.
    { label: "Per day", value: money(values.pricePerDay) },
    ...(values.pricePerWeek.trim()
      ? [{ label: "Per week", value: money(values.pricePerWeek) }]
      : []),
    ...(values.pricePerMonth.trim()
      ? [{ label: "Per month", value: money(values.pricePerMonth) }]
      : []),
    { label: "Security deposit", value: money(values.securityDeposit) },
    {
      label: "Location",
      value: values.city
        ? [values.area, formatCity(values.city)].filter(Boolean).join(", ")
        : "-",
    },
    {
      label: "Photos",
      value: `${values.images.length} added`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium">
          Check this over before publishing
        </h2>
        <p className="text-muted-foreground text-sm">
          Your listing goes live immediately and appears in browse and search.
        </p>
      </div>

      <dl className="divide-border divide-y text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-4 py-2"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="max-w-[60%] text-right font-medium break-words">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1">
        <dt className="text-muted-foreground text-sm">Description</dt>
        <p className="text-sm whitespace-pre-line">{values.description}</p>
      </div>
    </div>
  );
}

export { CreateListingForm };
