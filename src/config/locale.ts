/**
 * Pakistan localization configuration
 * Target market: Pakistan (PKR Currency, Asia/Karachi Timezone)
 */
export const LOCALE_CONFIG = {
  // Currency
  currency: {
    code: "PKR",
    symbol: "Rs.",
    locale: "en-PK",
  },

  // Timezone
  timezone: "Asia/Karachi",

  // Date format
  dateFormat: "dd MMM yyyy",
  dateTimeFormat: "dd MMM yyyy, hh:mm a",

  // Phone
  phoneCountryCode: "+92",

  // Initial launch cities (MVP)
  cities: [
    "Karachi",
    "Lahore",
    "Islamabad",
  ] as const,

  // Future expansion cities
  futureCities: [
    "Rawalpindi",
    "Faisalabad",
    "Peshawar",
    "Multan",
  ] as const,
} as const;

export type City = (typeof LOCALE_CONFIG.cities)[number];
export type FutureCity = (typeof LOCALE_CONFIG.futureCities)[number];
