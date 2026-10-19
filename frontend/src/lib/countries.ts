export type CountryOption = { code: string; name: string; enabled: boolean };

export const COUNTRIES: CountryOption[] = [
  { code: "US", name: "United States", enabled: true },
  { code: "CA", name: "Canada", enabled: false },
  { code: "GB", name: "United Kingdom", enabled: false },
  { code: "IN", name: "India", enabled: false },
  { code: "AU", name: "Australia", enabled: false },
  { code: "OTHER", name: "Other countries", enabled: false },
];

export const COMING_SOON_MESSAGE =
  "We're coming to this country soon! We're working to bring WeatherRoute to your area. For now, you can explore routes within the United States.";
