"use client";

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
import { CONDITION_LABELS } from "@/lib/utils/listing";
import { DESCRIPTION_MAX } from "@/lib/validations/listing";

import type { CategoryOption } from "@/lib/queries/categories";
import type { ListingFormValues } from "@/lib/validations/listing";
import type { UseFormReturn } from "react-hook-form";

/**
 * The listing form's field groups, shared by creating and editing.
 *
 * Extracted because the two forms present the same fields in different shapes: creating
 * is a five-step wizard, editing is one page with everything visible. Duplicating the
 * inputs would mean a validation message or an `aria-invalid` fixed in one and forgotten
 * in the other - and a field added to only one of them.
 *
 * Each group takes the whole `UseFormReturn` rather than individual props. It keeps the
 * signatures stable as fields are added, and both parents already own a single form
 * instance covering every step.
 */

/** Matches `Input`'s tokens so native selects sit flush beside one. */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-visible:ring-3";

interface FieldGroupProps {
  form: UseFormReturn<ListingFormValues>;
  disabled: boolean;
}

interface BasicsProps extends FieldGroupProps {
  categories: readonly CategoryOption[];
}

/** Title, description, category, subcategory, condition. */
function ListingBasicsFields({ form, disabled, categories }: BasicsProps) {
  const { errors } = form.formState;
  const description = form.watch("description");
  const categorySlug = form.watch("categorySlug");

  /**
   * Subcategories for the chosen category, recomputed as it changes.
   *
   * Worth contrasting with the browse filter sidebar, which cannot do this: that form is
   * deliberately JavaScript-free, so its subcategory list only updates on a round trip.
   * Here there is already a client bundle, so the dependent select can be live.
   */
  const activeCategory = categories.find(
    (category) => category.slug === categorySlug
  );

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(errors.title)}>
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <Input
          id="title"
          placeholder="Canon EOS R6 with 24-105mm lens"
          aria-invalid={Boolean(errors.title)}
          disabled={disabled}
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
          disabled={disabled}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-3"
          {...form.register("description")}
        />
        <FieldDescription>
          {/* Live count, so the limit is discovered before submitting. */}
          {description.length} / {DESCRIPTION_MAX} characters.
        </FieldDescription>
        <FieldError errors={[errors.description]} />
      </Field>

      <Field data-invalid={Boolean(errors.categorySlug)}>
        <FieldLabel htmlFor="categorySlug">Category</FieldLabel>
        <select
          id="categorySlug"
          className={SELECT_CLASS}
          aria-invalid={Boolean(errors.categorySlug)}
          disabled={disabled}
          {...form.register("categorySlug", {
            // Clearing the subcategory is required, not cosmetic: keeping one from the
            // previous category would submit a pair the server rejects, and the error
            // would point at a field the user never touched.
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
          disabled={disabled || !activeCategory}
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
          disabled={disabled}
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
  );
}

/** The four rupee amounts. */
function ListingPricingFields({ form, disabled }: FieldGroupProps) {
  const { errors } = form.formState;

  return (
    <FieldGroup>
      <PriceField
        name="pricePerDay"
        label="Price per day (PKR)"
        description="What one day costs. Required."
        error={errors.pricePerDay?.message}
        disabled={disabled}
        form={form}
      />
      <PriceField
        name="pricePerWeek"
        label="Price per week (optional)"
        description="Leave blank if you only rent by the day."
        error={errors.pricePerWeek?.message}
        disabled={disabled}
        form={form}
      />
      <PriceField
        name="pricePerMonth"
        label="Price per month (optional)"
        description="Leave blank if you do not offer monthly rentals."
        error={errors.pricePerMonth?.message}
        disabled={disabled}
        form={form}
      />
      <PriceField
        name="securityDeposit"
        label="Security deposit (PKR)"
        description="Refunded when the item comes back. Enter 0 for none."
        error={errors.securityDeposit?.message}
        disabled={disabled}
        form={form}
      />
    </FieldGroup>
  );
}

/** City and area. */
function ListingLocationFields({ form, disabled }: FieldGroupProps) {
  const { errors } = form.formState;

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(errors.city)}>
        <FieldLabel htmlFor="city">City</FieldLabel>
        <select
          id="city"
          className={SELECT_CLASS}
          aria-invalid={Boolean(errors.city)}
          disabled={disabled}
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
          disabled={disabled}
          {...form.register("area")}
        />
        <FieldDescription>
          Helps renters judge distance. Do not put your full address here - it
          is shown publicly.
        </FieldDescription>
        <FieldError errors={[errors.area]} />
      </Field>
    </FieldGroup>
  );
}

interface PriceFieldProps extends FieldGroupProps {
  name: "pricePerDay" | "pricePerWeek" | "pricePerMonth" | "securityDeposit";
  label: string;
  description: string;
  error: string | undefined;
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
  form,
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
        {...form.register(name)}
      />
      <FieldDescription>{description}</FieldDescription>
      {error && <FieldError errors={[{ message: error }]} />}
    </Field>
  );
}

export { ListingBasicsFields, ListingLocationFields, ListingPricingFields };
