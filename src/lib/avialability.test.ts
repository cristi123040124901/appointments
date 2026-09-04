import { describe, it, expect } from "vitest";
import {
  computeAvailability,
  windowsForDay,
  zonedToUtc,
  weekdayOf,
  type AvailabilityInput,
  type StaffInput,
} from "./availability";

const TZ = "Europe/Bucharest";

const ana: StaffInput = {
  id: "ana",
  name: "Ana",
  durationMinutes: 25,
  bufferMinutes: 10,
  workingHours: [
    { weekday: 2, startTime: "09:00", endTime: "13:00" },
    { weekday: 2, startTime: "14:00", endTime: "18:00" },
  ],
};

const base = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  timezone: TZ,
  dates: ["2026-09-08"], // marți
  staff: [ana],
  exceptions: [],
  bookings: [],
  now: new Date("2020-01-01T00:00:00Z"), // demult, ca să nu filtreze nimic
  ...over,
});

const times = (r: ReturnType<typeof computeAvailability>) =>
  r[0].slots.map((s) => s.localTime);

/* ------------------------------------------------------------------ */

describe("zonedToUtc", () => {
  it("aplică offsetul de vară (+03:00)", () => {
    expect(zonedToUtc("2026-07-15", "09:00", TZ).toISOString()).toBe(
      "2026-07-15T06:00:00.000Z",
    );
  });

  it("aplică offsetul de iarnă (+02:00)", () => {
    expect(zonedToUtc("2026-01-15", "09:00", TZ).toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
  });

  it("tratează corect ziua schimbării la ora de iarnă", () => {
    // 25 oct 2026, ceasul dă înapoi la 04:00 locale
    expect(zonedToUtc("2026-10-25", "09:00", TZ).toISOString()).toBe(
      "2026-10-25T07:00:00.000Z",
    );
  });
});

describe("weekdayOf", () => {
  it("returnează 2 pentru marți", () => {
    expect(weekdayOf("2026-09-08")).toBe(2);
  });
  it("returnează 0 pentru duminică", () => {
    expect(weekdayOf("2026-09-06")).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe("windowsForDay", () => {
  it("întoarce intervalele programului recurent", () => {
    expect(windowsForDay(ana, "2026-09-08", [])).toEqual([
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: "18:00" },
    ]);
  });

  it("zi fără program → niciun interval", () => {
    expect(windowsForDay(ana, "2026-09-06", [])).toEqual([]); // duminică
  });

  it("excepția de tenant închide ziua pentru toți", () => {
    const ex = [
      {
        staffId: null,
        date: "2026-09-08",
        isClosed: true,
        startTime: null,
        endTime: null,
      },
    ];
    expect(windowsForDay(ana, "2026-09-08", ex)).toEqual([]);
  });

  it("excepția de staff închide ziua doar pentru el", () => {
    const ex = [
      {
        staffId: "ana",
        date: "2026-09-08",
        isClosed: true,
        startTime: null,
        endTime: null,
      },
    ];
    expect(windowsForDay(ana, "2026-09-08", ex)).toEqual([]);
    expect(
      windowsForDay({ ...ana, id: "bogdan" }, "2026-09-08", ex),
    ).toHaveLength(2);
  });

  it("excepția cu program special înlocuiește programul normal", () => {
    const ex = [
      {
        staffId: "ana",
        date: "2026-09-08",
        isClosed: false,
        startTime: "11:00",
        endTime: "15:00",
      },
    ];
    expect(windowsForDay(ana, "2026-09-08", ex)).toEqual([
      { start: "11:00", end: "15:00" },
    ]);
  });

  it("excepția de tenant cu program scurt restrânge programul normal", () => {
    const ex = [
      {
        staffId: null,
        date: "2026-09-08",
        isClosed: false,
        startTime: "10:00",
        endTime: "12:00",
      },
    ];
    expect(windowsForDay(ana, "2026-09-08", ex)).toEqual([
      { start: "10:00", end: "12:00" },
    ]);
  });
});

/* ------------------------------------------------------------------ */

describe("computeAvailability — grilă", () => {
  it("pasul implicit e durata + buffer (25+10=35 min)", () => {
    const t = times(computeAvailability(base()));
    expect(t.slice(0, 4)).toEqual(["09:00", "09:35", "10:10", "10:45"]);
  });

  it("nu oferă sloturi al căror serviciu depășește ora de închidere", () => {
    const t = times(computeAvailability(base()));
    // ultimul interval se termină la 18:00; serviciul de 25 min trebuie să încapă
    const last = t[t.length - 1];
    expect(
      zonedToUtc("2026-09-08", last, TZ).getTime() + 25 * 60_000,
    ).toBeLessThanOrEqual(zonedToUtc("2026-09-08", "18:00", TZ).getTime());
  });

  it("pauza de prânz produce o discontinuitate", () => {
    const t = times(computeAvailability(base()));
    expect(t).toContain("14:00");
    expect(t.some((x) => x > "12:35" && x < "14:00")).toBe(false);
  });

  it("stepMinutes explicit suprascrie pasul", () => {
    const t = times(computeAvailability(base({ stepMinutes: 60 })));
    expect(t.slice(0, 3)).toEqual(["09:00", "10:00", "11:00"]);
  });
});

describe("computeAvailability — rezervări", () => {
  it("elimină slotul ocupat", () => {
    const r = computeAvailability(
      base({
        bookings: [
          {
            staffId: "ana",
            startAt: zonedToUtc("2026-09-08", "09:00", TZ),
            endAt: zonedToUtc("2026-09-08", "09:35", TZ),
          },
        ],
      }),
    );
    expect(times(r)).not.toContain("09:00");
    expect(times(r)).toContain("09:35");
  });

  it("bufferul rezervării blochează și slotul următor dacă se atinge", () => {
    // rezervare 09:10-09:45 (cu buffer) → slotul de 09:00 (blocat până 09:35) e liber?
    // 09:00+35 = 09:35 > 09:10 → suprapunere, deci ocupat
    const r = computeAvailability(
      base({
        bookings: [
          {
            staffId: "ana",
            startAt: zonedToUtc("2026-09-08", "09:10", TZ),
            endAt: zonedToUtc("2026-09-08", "09:45", TZ),
          },
        ],
      }),
    );
    expect(times(r)).not.toContain("09:00");
  });

  it("intervalele care se ating exact NU se consideră suprapuse", () => {
    const r = computeAvailability(
      base({
        bookings: [
          {
            staffId: "ana",
            startAt: zonedToUtc("2026-09-08", "08:00", TZ),
            endAt: zonedToUtc("2026-09-08", "09:00", TZ),
          },
        ],
      }),
    );
    expect(times(r)).toContain("09:00");
  });

  it("rezervarea altui prestator nu afectează sloturile Anei", () => {
    const r = computeAvailability(
      base({
        bookings: [
          {
            staffId: "bogdan",
            startAt: zonedToUtc("2026-09-08", "09:00", TZ),
            endAt: zonedToUtc("2026-09-08", "10:00", TZ),
          },
        ],
      }),
    );
    expect(times(r)).toContain("09:00");
  });
});

describe("computeAvailability — mai mulți prestatori", () => {
  const bogdan: StaffInput = {
    id: "bogdan",
    name: "Bogdan",
    durationMinutes: 30,
    bufferMinutes: 10,
    workingHours: [{ weekday: 2, startTime: "09:00", endTime: "18:00" }],
  };

  it("unifică sloturile cu același start și strânge staffIds", () => {
    const r = computeAvailability(base({ staff: [ana, bogdan] }));
    const nine = r[0].slots.find((s) => s.localTime === "09:00")!;
    expect(nine.staffIds.sort()).toEqual(["ana", "bogdan"]);
  });

  it("slotul rămâne oferit dacă măcar un prestator e liber", () => {
    const r = computeAvailability(
      base({
        staff: [ana, bogdan],
        bookings: [
          {
            staffId: "ana",
            startAt: zonedToUtc("2026-09-08", "09:00", TZ),
            endAt: zonedToUtc("2026-09-08", "09:35", TZ),
          },
        ],
      }),
    );
    const nine = r[0].slots.find((s) => s.localTime === "09:00")!;
    expect(nine.staffIds).toEqual(["bogdan"]);
  });

  it("pauza de prânz a Anei e acoperită de Bogdan", () => {
    const t = times(computeAvailability(base({ staff: [ana, bogdan] })));
    expect(t).toContain("13:00");
  });
});

describe("computeAvailability — trecutul", () => {
  it("nu oferă sloturi anterioare lui now", () => {
    const t = times(
      computeAvailability(base({ now: zonedToUtc("2026-09-08", "12:00", TZ) })),
    );
    expect(t.every((x) => x >= "12:00")).toBe(true);
  });
});

describe("computeAvailability — ora de vară", () => {
  it("programul rămâne 09:00-18:00 local în ziua schimbării", () => {
    const dstStaff: StaffInput = {
      ...ana,
      workingHours: [{ weekday: 0, startTime: "09:00", endTime: "18:00" }],
    };
    const r = computeAvailability(
      base({ dates: ["2026-10-25"], staff: [dstStaff] }), // duminică, trecere la ora de iarnă
    );
    expect(r[0].slots[0].localTime).toBe("09:00");
    // 09:00 local în offset +02:00 (după schimbare) = 07:00 UTC
    expect(r[0].slots[0].startAt.toISOString()).toBe(
      "2026-10-25T07:00:00.000Z",
    );
  });
});
