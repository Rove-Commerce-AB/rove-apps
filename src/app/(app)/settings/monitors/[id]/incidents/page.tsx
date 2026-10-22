import { redirect } from "next/navigation";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { supportMonitorIncidentsHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyMonitorIncidentsRedirect({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const { rows } = await cloudSqlPool.query<{ customer_id: string }>(
    `SELECT customer_id FROM monitoring.monitors WHERE id = $1`,
    [id]
  );
  const customerId = rows[0]?.customer_id;
  if (!customerId) redirect("/support/overview");

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") search.set(key, value);
  }
  const qs = search.toString();
  redirect(
    `${supportMonitorIncidentsHref(customerId, id)}${qs ? `?${qs}` : ""}`
  );
}
