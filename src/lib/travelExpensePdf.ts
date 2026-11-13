import { jsPDF } from "jspdf";
import {
  sumMileageKm,
  sumTravelCosts,
  travelExpenseYear,
  type TravelExpenseFormData,
} from "@/lib/travelExpenseTypes";

function money(value: string): string {
  const t = value.trim();
  return t ? t : "";
}

function line(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW = 42
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(value || "—", x + labelW, y);
}

/**
 * Client-side PDF that mirrors the travel expense blankett.
 * Signature / approval lines are left blank for manual signing.
 */
export function downloadTravelExpensePdf(form: TravelExpenseFormData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = 14;

  const year = travelExpenseYear(form);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Travel expense ${year} with mileage log`, margin, y);
  y += 8;

  doc.setDrawColor(180);
  doc.rect(margin, y, pageW - margin * 2, 28);
  y += 5;
  line(doc, "Name", form.name, margin + 2, y);
  line(doc, "Employee no.", form.employeeNumber, margin + 95, y, 28);
  y += 5;
  line(doc, "Department", form.department, margin + 2, y);
  y += 5;
  line(doc, "Destination", form.destination, margin + 2, y);
  y += 5;
  line(doc, "Purpose", form.purpose, margin + 2, y);
  y += 8;

  doc.rect(margin, y, pageW - margin * 2, 16);
  y += 5;
  line(doc, "Departure date", form.departureDate, margin + 2, y, 30);
  line(doc, "Time", form.departureTime, margin + 55, y, 12);
  line(doc, "Extra hours", form.departureExtraHours, margin + 95, y, 28);
  y += 5;
  line(doc, "Return date", form.returnDate, margin + 2, y, 30);
  line(doc, "Time", form.returnTime, margin + 55, y, 12);
  line(doc, "Extra hours", form.returnExtraHours, margin + 95, y, 28);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Per diem — domestic", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `Full day  qty ${form.domesticFullDays || "—"}  amount ${money(form.domesticFullDayAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Half day  qty ${form.domesticHalfDays || "—"}  amount ${money(form.domesticHalfDayAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Night allowance  qty ${form.domesticNightQty || "—"}  amount ${money(form.domesticNightAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Meal deduction breakfast  qty ${form.domesticBreakfastQty || "—"}  amount ${money(form.domesticBreakfastAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Meal deduction lunch/dinner  qty ${form.domesticLunchDinnerQty || "—"}  amount ${money(form.domesticLunchDinnerAmount) || "—"}`,
    margin,
    y
  );
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Per diem — abroad", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (const row of form.foreignRows) {
    if (
      !row.country &&
      !row.fullDays &&
      !row.fullDayAmount &&
      !row.halfDays &&
      !row.halfDayAmount
    ) {
      continue;
    }
    doc.text(
      `${row.country || "—"}  full ${row.fullDays || "—"}/${money(row.fullDayAmount) || "—"}  half ${row.halfDays || "—"}/${money(row.halfDayAmount) || "—"}`,
      margin,
      y
    );
    y += 4;
  }
  doc.text(
    `Meal deduction breakfast  qty ${form.foreignBreakfastQty || "—"}  amount ${money(form.foreignBreakfastAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Meal deduction lunch/dinner  qty ${form.foreignLunchDinnerQty || "—"}  amount ${money(form.foreignLunchDinnerAmount) || "—"}`,
    margin,
    y
  );
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Taxable meal benefit (company-paid meals)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `Free breakfast  qty ${form.freeBreakfastQty || "—"}  amount ${money(form.freeBreakfastAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Free lunch/dinner  qty ${form.freeLunchDinnerQty || "—"}  amount ${money(form.freeLunchDinnerAmount) || "—"}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `All meals free  qty ${form.freeAllMealsQty || "—"}  amount ${money(form.freeAllMealsAmount) || "—"}`,
    margin,
    y
  );
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Travel expenses (attach receipts)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Tickets (train/bus/subway)  ${money(form.ticketsAmount) || "—"}`, margin, y);
  y += 4;
  doc.text(`Rental car  ${money(form.rentalCarAmount) || "—"}`, margin, y);
  y += 4;
  doc.text(`Taxi  ${money(form.taxiAmount) || "—"}`, margin, y);
  y += 4;
  doc.text(`Other  ${money(form.otherAmount) || "—"}`, margin, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text(`Total travel expenses  ${sumTravelCosts(form).toFixed(2)}`, margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Mileage log", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Date", margin, y);
  doc.text("Companies / places visited", margin + 28, y);
  doc.text("Km", pageW - margin - 15, y, { align: "right" });
  y += 4;
  for (const row of form.mileageRows) {
    if (!row.date && !row.places && !row.km) continue;
    doc.text(row.date || "—", margin, y);
    doc.text(row.places || "—", margin + 28, y, {
      maxWidth: pageW - margin * 2 - 50,
    });
    doc.text(row.km || "—", pageW - margin - 15, y, { align: "right" });
    y += 4;
  }
  doc.setFont("helvetica", "bold");
  doc.text(`Total km  ${sumMileageKm(form).toFixed(1)}`, margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.line(margin, y, margin + 70, y);
  doc.text("Date and signature", margin, y + 4);
  doc.line(margin + 95, y, margin + 165, y);
  doc.text("Approval", margin + 95, y + 4);

  const safeDest =
    form.destination.trim().replace(/[^\w\-]+/g, "_").slice(0, 40) || "trip";
  doc.save(`travel-expense-${year}-${safeDest}.pdf`);
}
