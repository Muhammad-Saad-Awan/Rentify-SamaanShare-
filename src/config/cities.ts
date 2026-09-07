/**
 * Pakistani cities configuration
 * Initial launch: Karachi, Lahore, Islamabad
 */
export const PAKISTANI_CITIES = [
  {
    value: "karachi",
    label: "Karachi",
    province: "Sindh",
  },
  {
    value: "lahore",
    label: "Lahore",
    province: "Punjab",
  },
  {
    value: "islamabad",
    label: "Islamabad",
    province: "Federal Capital",
  },
] as const;

// Type for city values
export type CityValue = (typeof PAKISTANI_CITIES)[number]["value"];

// Helper to get city label from value
export function getCityLabel(value: CityValue): string {
  const city = PAKISTANI_CITIES.find((c) => c.value === value);
  return city?.label ?? value;
}

/**
 * Every city value, as an arbitrary-string-testable list.
 *
 * Widened to `string[]` deliberately: `PAKISTANI_CITIES` is `as const`, so the mapped
 * array would be a union of literals and `.includes()` would refuse any string that is
 * not already known to be one of them - which is exactly what a validator needs to test.
 *
 * Lives here rather than beside one validator because two features now choose a city
 * from the same list (a listing's location and a member's profile), and a second copy
 * is a second place to forget a city when the launch list grows.
 */
export const CITY_VALUES: readonly string[] = PAKISTANI_CITIES.map(
  (city) => city.value
);
