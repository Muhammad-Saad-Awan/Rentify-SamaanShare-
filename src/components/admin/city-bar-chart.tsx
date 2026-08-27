import { formatCity } from "@/lib/utils/listing";

interface CityBarChartRow {
  city: string;
  value: number;
  /** Pre-formatted for display, because a count and a PKR amount format differently. */
  display: string;
}

interface CityBarChartProps {
  title: string;
  /** What the number is, so the bars need no legend of their own. */
  caption: string;
  rows: readonly CityBarChartRow[];
}

/**
 * One measure per city, as horizontal bars.
 *
 * SIX DECISIONS, EACH FOR A REASON.
 *
 * 1. HORIZONTAL BARS, NOT A PIE. The job is comparing magnitudes across a handful of named
 *    categories, which is what a bar length does best; city names are long enough that horizontal
 *    keeps them readable without rotated labels. A pie would ask the reader to compare angles.
 *
 * 2. ONE MEASURE PER CHART. Live listings and recorded rent are different scales, so they get two
 *    charts rather than two axes on one. A second y-scale is the most common way a chart lies -
 *    the crossover point is chosen by whoever set the ranges.
 *
 * 3. ONE COLOUR, NO LEGEND. A single series carries no identity to encode, so there is nothing for a
 *    categorical palette to distinguish and nothing for a legend to explain - the title names it. The
 *    fill is the app's own `--primary` token rather than a hardcoded hex, so light and dark come from
 *    the design system that already balanced them. (No categorical scheme means no adjacent-pair
 *    colour-blindness question to answer: there are no adjacent hues.)
 *
 * 4. EVERY BAR IS DIRECTLY LABELLED, and that is deliberate rather than clutter. With a handful of
 *    rows the value beside the bar removes the need for an axis, a gridline or a tooltip - and it
 *    means the chart reads identically to a screen reader, which is why there is no separate table
 *    view and no client-side JavaScript here.
 *
 * 5. A NON-ZERO VALUE ALWAYS SHOWS SOMETHING. One rental against a leader of five hundred is a 0.2%
 *    bar, which rounds to nothing on screen and reads as "no activity". Floored at 2% so the
 *    difference between none and a little stays visible, with the true figure in the label.
 *
 * 6. THE TRACK IS RECESSIVE. `bg-muted` behind each bar shows the scale each is measured against
 *    without competing with the data, and the 2px gap between rows keeps adjacent fills from reading
 *    as one block.
 */
function CityBarChart({ title, caption, rows }: CityBarChartProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">Nothing recorded yet.</p>
      </div>
    );
  }

  // The largest value sets the scale. Guarded so an all-zero set divides by 1 rather than by 0.
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-heading text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">{caption}</p>
      </div>

      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const share =
            row.value <= 0 ? 0 : Math.max(2, (row.value / max) * 100);

          return (
            <li key={row.city} className="flex items-center gap-2 text-xs">
              <span
                className="w-20 shrink-0 truncate"
                title={formatCity(row.city)}
              >
                {formatCity(row.city)}
              </span>

              {/*
                The bar is decorative: the number is already in the label beside it, so a screen
                reader gets the full row from the text and nothing is encoded in the fill alone.
              */}
              <span
                className="bg-muted relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm"
                aria-hidden="true"
              >
                <span
                  className="bg-primary absolute inset-y-0 left-0 rounded-sm"
                  style={{ width: `${share}%` }}
                />
              </span>

              <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                {row.display}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { CityBarChart };
export type { CityBarChartRow };
