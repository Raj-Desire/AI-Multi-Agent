/**
 * Comprehensive IANA Timezone Helper using standard browser Intl API
 * Generates all 400+ world timezones formatted with real-time UTC offsets, 
 * region categorizations, and human-readable city labels.
 */

export interface TimezoneOption {
  value: string; // e.g. "Asia/Kolkata"
  label: string; // e.g. "Asia/Kolkata (GMT+05:30) - Kolkata, India"
  group: string; // e.g. "Asia", "America", "Europe"
  offsetMinutes: number;
}

export function getAllWorldTimezones(): TimezoneOption[] {
  try {
    const rawZones: string[] =
      typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function"
        ? (Intl as any).supportedValuesOf("timeZone")
        : [
            "Asia/Kolkata",
            "Europe/London",
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "Asia/Dubai",
            "Asia/Singapore",
            "Australia/Sydney",
            "Europe/Paris",
            "Asia/Tokyo",
            "UTC"
          ];

    const now = new Date();

    const options: TimezoneOption[] = rawZones.map((tz) => {
      let offsetStr = "+00:00";
      let offsetMinutes = 0;

      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName: "shortOffset"
        });
        const parts = formatter.formatToParts(now);
        const tzPart = parts.find((p) => p.type === "timeZoneName");
        offsetStr = tzPart?.value || "UTC";
      } catch {
        offsetStr = "UTC";
      }

      // Prettify label
      const parts = tz.split("/");
      const region = parts[0] || "Other";
      const city = (parts[parts.length - 1] || tz).replace(/_/g, " ");

      return {
        value: tz,
        label: `${city} (${offsetStr}) - ${tz}`,
        group: region,
        offsetMinutes
      };
    });

    // Sort by group and then by name
    return options.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  } catch (err) {
    console.warn("Failed to retrieve Intl timezones:", err);
    return [
      { value: "Asia/Kolkata", label: "Kolkata (GMT+05:30) - Asia/Kolkata", group: "Asia", offsetMinutes: 330 },
      { value: "Europe/London", label: "London (GMT+00:00) - Europe/London", group: "Europe", offsetMinutes: 0 },
      { value: "America/New_York", label: "New York (GMT-05:00) - America/New_York", group: "America", offsetMinutes: -300 },
      { value: "America/Los_Angeles", label: "Los Angeles (GMT-08:00) - America/Los_Angeles", group: "America", offsetMinutes: -480 }
    ];
  }
}
