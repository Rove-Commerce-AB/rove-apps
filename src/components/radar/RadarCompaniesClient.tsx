"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Input,
  PageHeader,
  Panel,
  Select,
} from "@/components/ui";
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import type { RadarAudience, RadarCompanyListItem } from "@/lib/radar/types";
import { ROUTES } from "@/lib/routes";

type Props = {
  companies: RadarCompanyListItem[];
  audiences: RadarAudience[];
};

export function RadarCompaniesClient({ companies, audiences }: Props) {
  const [q, setQ] = useState("");
  const [audienceId, setAudienceId] = useState("");
  const [tech, setTech] = useState("");
  const [customer, setCustomer] = useState("");

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        if (
          !c.name.toLowerCase().includes(needle) &&
          !c.organization_number.includes(needle.replace(/\D/g, ""))
        ) {
          return false;
        }
      }
      if (audienceId && !c.audience_names.some((n) => {
        const a = audiences.find((x) => x.id === audienceId);
        return a ? n === a.name : false;
      })) {
        return false;
      }
      if (tech && !c.technologies.some((t) => t.toLowerCase().includes(tech.toLowerCase()))) {
        return false;
      }
      if (customer === "yes" && !c.matched_customer_id) return false;
      if (customer === "no" && c.matched_customer_id) return false;
      return true;
    });
  }, [companies, q, audienceId, tech, customer, audiences]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Companies"
        description="Imported companies with domains, technologies, and Rove customer match."
      />

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search name or org number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          variant="filter"
          value={audienceId || "__all"}
          onValueChange={(v) => setAudienceId(v === "__all" ? "" : v)}
          options={[
            { value: "__all", label: "All target groups" },
            ...audiences.map((a) => ({ value: a.id, label: a.name })),
          ]}
          className="max-w-xs"
        />
        <Input
          className="max-w-[12rem]"
          placeholder="Technology"
          value={tech}
          onChange={(e) => setTech(e.target.value)}
        />
        <Select
          variant="filter"
          value={customer || "__all"}
          onValueChange={(v) => setCustomer(v === "__all" ? "" : v)}
          options={[
            { value: "__all", label: "Customer match" },
            { value: "yes", label: "Existing customer" },
            { value: "no", label: "New prospect" },
          ]}
          className="max-w-[12rem]"
        />
      </div>

      <Panel>
        <div className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-table-header text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">County</th>
                <th className="px-4 py-2 font-medium">SNI</th>
                <th className="px-4 py-2 font-medium">Domain</th>
                <th className="px-4 py-2 font-medium">Technology</th>
                <th className="px-4 py-2 font-medium">Prospect</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border-subtle">
                  <td className="px-4 py-3">
                    <Link
                      href={`${ROUTES.radarCompanies}/${c.id}`}
                      className="font-medium text-text-link"
                    >
                      {c.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-text-tertiary">
                      <span>{formatOrganizationNumber(c.organization_number)}</span>
                      {c.is_demo ? <Badge variant="warning">Demo</Badge> : null}
                      {c.financials_origin === "unknown" ? (
                        <Badge variant="muted">No financials</Badge>
                      ) : null}
                      {c.matched_customer_name ? (
                        <Badge variant="success">Customer</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.county ?? "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.sni_code ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.primary_hostname ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.technologies.length > 0
                      ? c.technologies.join(", ")
                      : "Not identified"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.prospect_status ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-text-secondary">No companies match.</p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
