import type { ProjectType } from "@/types";

export type TimeReportSummaryBucket = {
  customerId: string;
  customerName: string;
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  /** Set for absence projects (e.g. SEM, SEM_OBE). */
  absenceCode: string | null;
  month: number;
  hours: number;
};

export type TimeReportSummaryData = {
  consultantId: string | null;
  consultantName: string | null;
  year: number;
  availableYears: number[];
  buckets: TimeReportSummaryBucket[];
};
