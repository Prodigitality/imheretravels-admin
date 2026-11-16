import { getCountries, type Country } from "react-phone-number-input";

/**
 * Country order for the WhatsApp number pickers. Most ad traffic comes from the
 * UK and Ireland, so those two come first; every other country follows in the
 * usual order. The main booker's default is the visitor's own country (from
 * /api/public/geo), else the UK.
 */
export const PHONE_PRIORITY_COUNTRIES: Country[] = ["GB", "IE"];

export function phoneCountryOrder(): Country[] {
  const all = getCountries();
  return [
    ...PHONE_PRIORITY_COUNTRIES.filter((c) => all.includes(c)),
    ...all.filter((c) => !PHONE_PRIORITY_COUNTRIES.includes(c)),
  ];
}

/** True for a country code the phone pickers know. */
export function isPhoneCountry(code: unknown): code is Country {
  return typeof code === "string" && (getCountries() as string[]).includes(code);
}
