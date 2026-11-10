import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CustomerFilter } from "@/components/CustomerFilter";
import { SupportCasesClient } from "@/components/SupportCasesClient";
import { CUSTOMER_FILTER_QUERY_KEY } from "@/lib/customerFilter";
import { ROUTES } from "@/lib/routes";
import { requireSupportActor } from "@/lib/supportActor";
import {
  listSupportCases,
  listSupportCasesForCustomers,
} from "@/lib/supportCases";
import {
  listSupportFilterCustomers,
  resolveSupportCustomerFilter,
  SUPPORT_CUSTOMER_FILTER_COOKIE,
} from "@/lib/supportCustomerFilter";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ customer?: string; case?: string }>;
};

export default async function SupportIncidentsPage({ searchParams }: Props) {
  const actor = await requireSupportActor();
  const params = await searchParams;
  const cookieStore = await cookies();
  const customers = await listSupportFilterCustomers(actor);

  if (customers.length === 0) {
    redirect("/access-denied");
  }

  const selectedCustomerId =
    actor.role === "customer" && customers.length === 1
      ? customers[0].id
      : resolveSupportCustomerFilter({
          queryValue: params.customer,
          cookieValue: cookieStore.get(SUPPORT_CUSTOMER_FILTER_COOKIE)?.value,
          customers,
        });

  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId) ?? null
    : null;
  const noContractSelected =
    selectedCustomer != null && !selectedCustomer.hasActiveContract;

  const eligibleCustomers = customers.filter((c) => c.hasActiveContract);

  let cases: Awaited<ReturnType<typeof listSupportCases>>["cases"] = [];
  let totalCount = 0;
  let loadError: string | undefined;

  if (!noContractSelected) {
    try {
      const listed = selectedCustomerId
        ? await listSupportCases(selectedCustomerId)
        : await listSupportCasesForCustomers(
            eligibleCustomers.map((c) => c.id)
          );
      cases = listed.cases;
      totalCount = listed.totalCount;
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Failed to load incidents";
    }
  }

  return (
    <SupportCasesClient
      key={selectedCustomerId ?? "all"}
      customerId={selectedCustomerId}
      customerName={selectedCustomer?.name}
      customers={eligibleCustomers.map((c) => ({ id: c.id, name: c.name }))}
      cases={cases}
      loadError={loadError}
      noContractSelected={noContractSelected}
      isCustomerUser={actor.role === "customer"}
      initialCaseId={params.case ?? null}
      truncated={totalCount > cases.length}
      totalCount={totalCount > cases.length ? totalCount : undefined}
      toolbar={
        <CustomerFilter
          customers={customers}
          value={selectedCustomerId}
          basePath={ROUTES.supportIncidents}
          cookieName={SUPPORT_CUSTOMER_FILTER_COOKIE}
          hideWhenSingle={actor.role === "customer"}
          queryKey={CUSTOMER_FILTER_QUERY_KEY}
        />
      }
    />
  );
}
