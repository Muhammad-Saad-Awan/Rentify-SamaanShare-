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
