"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ListFilterMenu,
  type ListFilterSection,
} from "@/components/ListFilterMenu";
import {
  buildPathWithCustomerFilter,
  CUSTOMER_FILTER_QUERY_KEY,
  persistCustomerFilterCookie,
  shouldHideCustomerFilter,
  type CustomerFilterOption,
} from "@/lib/customerFilter";

type Props = {
  customers: CustomerFilterOption[];
  /** Selected customer ids. Empty = All. */
  value: string[];
  basePath: string;
  cookieName: string;
  /** Hide the control when the actor only has one customer (customer users). */
  hideWhenSingle?: boolean;
  allLabel?: string;
  queryKey?: string;
  className?: string;
  /** Extra filter sections rendered in the same menu (e.g. Status). */
  extraSections?: ListFilterSection[];
};

export function CustomerFilter({
  customers,
  value,
  basePath,
  cookieName,
  hideWhenSingle = false,
  allLabel = "All customers",
  queryKey = CUSTOMER_FILTER_QUERY_KEY,
  className = "",
  extraSections = [],
}: Props) {
  const router = useRouter();
  const hideCustomer = shouldHideCustomerFilter(
    customers.length,
    hideWhenSingle
  );

  // Keep cookie in sync with the resolved selection (incl. deep links with ?customer=).
  useEffect(() => {
    persistCustomerFilterCookie(cookieName, value);
  }, [cookieName, value]);

  function applySelection(next: string[]) {
    persistCustomerFilterCookie(cookieName, next);
    router.replace(buildPathWithCustomerFilter(basePath, next, queryKey));
  }

  const sections: ListFilterSection[] = [
    ...extraSections,
    ...(!hideCustomer && customers.length > 0
      ? [
          {
            id: "customer",
            label: "Customer",
            allLabel,
            options: customers.map((customer) => ({
              id: customer.id,
              name: customer.name,
            })),
            selectedIds: value,
            onChange: applySelection,
          } satisfies ListFilterSection,
        ]
      : []),
  ];

  if (sections.length === 0) return null;

  return (
    <ListFilterMenu
      ariaLabel="Filter"
      className={className}
      sections={sections}
    />
  );
}
