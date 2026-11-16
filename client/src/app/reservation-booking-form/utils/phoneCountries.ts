import { getCountries, type Country } from "react-phone-number-input";
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

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

/** E.164 allows 15 digits; enough room for a leading 0 or a typed country code. */
export const WHATSAPP_MAX_DIGITS = 15;

/**
 * The digits typed into a WhatsApp number box. People type their number the
 * way they know it ("07911 123456", or "44 7911 123456"), so once it is a
 * complete, valid number for the chosen country, the leading 0 or the country
 * code is dropped (the box already shows "+44"). Nothing is cut off: a number
 * that is too long stays as typed and fails validation, so the visitor sees
 * the error instead of a silently shortened number.
 */
export function cleanWhatsAppDigits(raw: string, country: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, WHATSAPP_MAX_DIGITS);
  if (!isPhoneCountry(country) || !digits) return digits;
  // react-phone-number-input and libphonenumber-js each declare their own country type.
  const code = country as string as CountryCode;
  const national = parsePhoneNumberFromString(digits, code);
  if (national?.isValid()) return national.nationalNumber;
  const callingCode = getCountryCallingCode(code);
  if (digits.startsWith(callingCode)) {
    const international = parsePhoneNumberFromString(`+${digits}`);
    if (international?.isValid() && international.countryCallingCode === callingCode) {
      return international.nationalNumber;
    }
  }
  return digits;
}
