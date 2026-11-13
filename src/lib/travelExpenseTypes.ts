/** Travel expense form payload (no fixed unit rates in v1). */

export type ForeignPerDiemRow = {
  country: string;
  fullDays: string;
  fullDayAmount: string;
  halfDays: string;
  halfDayAmount: string;
};

export type MileageRow = {
  date: string;
  places: string;
  km: string;
};

export type TravelExpenseFormData = {
  name: string;
  employeeNumber: string;
  department: string;
  destination: string;
  purpose: string;
  departureDate: string;
  departureTime: string;
  departureExtraHours: string;
  returnDate: string;
  returnTime: string;
  returnExtraHours: string;

  domesticFullDays: string;
  domesticFullDayAmount: string;
  domesticHalfDays: string;
  domesticHalfDayAmount: string;
  domesticNightQty: string;
  domesticNightAmount: string;
  domesticBreakfastQty: string;
  domesticBreakfastAmount: string;
  domesticLunchDinnerQty: string;
  domesticLunchDinnerAmount: string;

  foreignRows: ForeignPerDiemRow[];
  foreignBreakfastQty: string;
  foreignBreakfastAmount: string;
  foreignLunchDinnerQty: string;
  foreignLunchDinnerAmount: string;

  freeBreakfastQty: string;
  freeBreakfastAmount: string;
  freeLunchDinnerQty: string;
  freeLunchDinnerAmount: string;
  freeAllMealsQty: string;
  freeAllMealsAmount: string;

  ticketsAmount: string;
  rentalCarAmount: string;
  taxiAmount: string;
  otherAmount: string;

  mileageRows: MileageRow[];
};

export type TravelExpenseListItem = {
  id: string;
  destination: string;
  purpose: string;
  departureDate: string | null;
  returnDate: string | null;
  updatedAt: string;
  createdAt: string;
};

export type TravelExpenseRecord = TravelExpenseListItem & {
  formData: TravelExpenseFormData;
};

export function emptyForeignRow(): ForeignPerDiemRow {
  return {
    country: "",
    fullDays: "",
    fullDayAmount: "",
    halfDays: "",
    halfDayAmount: "",
  };
}

export function emptyMileageRow(): MileageRow {
  return { date: "", places: "", km: "" };
}

export function emptyTravelExpenseForm(
  name = ""
): TravelExpenseFormData {
  return {
    name,
    employeeNumber: "",
    department: "",
    destination: "",
    purpose: "",
    departureDate: "",
    departureTime: "",
    departureExtraHours: "",
    returnDate: "",
    returnTime: "",
    returnExtraHours: "",

    domesticFullDays: "",
    domesticFullDayAmount: "",
    domesticHalfDays: "",
    domesticHalfDayAmount: "",
    domesticNightQty: "",
    domesticNightAmount: "",
    domesticBreakfastQty: "",
    domesticBreakfastAmount: "",
    domesticLunchDinnerQty: "",
    domesticLunchDinnerAmount: "",

    foreignRows: [emptyForeignRow(), emptyForeignRow()],
    foreignBreakfastQty: "",
    foreignBreakfastAmount: "",
    foreignLunchDinnerQty: "",
    foreignLunchDinnerAmount: "",

    freeBreakfastQty: "",
    freeBreakfastAmount: "",
    freeLunchDinnerQty: "",
    freeLunchDinnerAmount: "",
    freeAllMealsQty: "",
    freeAllMealsAmount: "",

    ticketsAmount: "",
    rentalCarAmount: "",
    taxiAmount: "",
    otherAmount: "",

    mileageRows: [
      emptyMileageRow(),
      emptyMileageRow(),
      emptyMileageRow(),
      emptyMileageRow(),
      emptyMileageRow(),
    ],
  };
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function asForeignRows(value: unknown): ForeignPerDiemRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [emptyForeignRow(), emptyForeignRow()];
  }
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      country: asString(r.country),
      fullDays: asString(r.fullDays),
      fullDayAmount: asString(r.fullDayAmount),
      halfDays: asString(r.halfDays),
      halfDayAmount: asString(r.halfDayAmount),
    };
  });
}

function asMileageRows(value: unknown): MileageRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      emptyMileageRow(),
      emptyMileageRow(),
      emptyMileageRow(),
      emptyMileageRow(),
      emptyMileageRow(),
    ];
  }
  const rows = value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      date: asString(r.date),
      places: asString(r.places),
      km: asString(r.km),
    };
  });
  while (rows.length < 5) rows.push(emptyMileageRow());
  return rows;
}

/** Normalize unknown JSONB into a typed form. */
export function parseTravelExpenseFormData(
  raw: unknown,
  fallbackName = ""
): TravelExpenseFormData {
  const base = emptyTravelExpenseForm(fallbackName);
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Record<string, unknown>;
  return {
    ...base,
    name: asString(d.name) || fallbackName,
    employeeNumber: asString(d.employeeNumber),
    department: asString(d.department),
    destination: asString(d.destination),
    purpose: asString(d.purpose),
    departureDate: asString(d.departureDate),
    departureTime: asString(d.departureTime),
    departureExtraHours: asString(d.departureExtraHours),
    returnDate: asString(d.returnDate),
    returnTime: asString(d.returnTime),
    returnExtraHours: asString(d.returnExtraHours),

    domesticFullDays: asString(d.domesticFullDays),
    domesticFullDayAmount: asString(d.domesticFullDayAmount),
    domesticHalfDays: asString(d.domesticHalfDays),
    domesticHalfDayAmount: asString(d.domesticHalfDayAmount),
    domesticNightQty: asString(d.domesticNightQty),
    domesticNightAmount: asString(d.domesticNightAmount),
    domesticBreakfastQty: asString(d.domesticBreakfastQty),
    domesticBreakfastAmount: asString(d.domesticBreakfastAmount),
    domesticLunchDinnerQty: asString(d.domesticLunchDinnerQty),
    domesticLunchDinnerAmount: asString(d.domesticLunchDinnerAmount),

    foreignRows: asForeignRows(d.foreignRows),
    foreignBreakfastQty: asString(d.foreignBreakfastQty),
    foreignBreakfastAmount: asString(d.foreignBreakfastAmount),
    foreignLunchDinnerQty: asString(d.foreignLunchDinnerQty),
    foreignLunchDinnerAmount: asString(d.foreignLunchDinnerAmount),

    freeBreakfastQty: asString(d.freeBreakfastQty),
    freeBreakfastAmount: asString(d.freeBreakfastAmount),
    freeLunchDinnerQty: asString(d.freeLunchDinnerQty),
    freeLunchDinnerAmount: asString(d.freeLunchDinnerAmount),
    freeAllMealsQty: asString(d.freeAllMealsQty),
    freeAllMealsAmount: asString(d.freeAllMealsAmount),

    ticketsAmount: asString(d.ticketsAmount),
    rentalCarAmount: asString(d.rentalCarAmount),
    taxiAmount: asString(d.taxiAmount),
    otherAmount: asString(d.otherAmount),

    mileageRows: asMileageRows(d.mileageRows),
  };
}

export function parseMoney(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function sumTravelCosts(form: TravelExpenseFormData): number {
  return (
    parseMoney(form.ticketsAmount) +
    parseMoney(form.rentalCarAmount) +
    parseMoney(form.taxiAmount) +
    parseMoney(form.otherAmount)
  );
}

export function sumMileageKm(form: TravelExpenseFormData): number {
  return form.mileageRows.reduce((sum, row) => sum + parseMoney(row.km), 0);
}

export function travelExpenseYear(form: TravelExpenseFormData): number {
  const fromDeparture = form.departureDate?.slice(0, 4);
  if (fromDeparture && /^\d{4}$/.test(fromDeparture)) {
    return Number(fromDeparture);
  }
  return new Date().getFullYear();
}
