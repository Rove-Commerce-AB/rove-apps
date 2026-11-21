"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSearchHitAsProspectAction,
  guessDomainForSearchHitAction,
} from "@/app/(app)/radar/actions";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import type { RadarSearchHit } from "@/lib/radar/types";
import { ROUTES } from "@/lib/routes";

type Props = {
  initialDirectoryCount: number;
};

export function RadarSearchClient({ initialDirectoryCount }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RadarSearchHit[]>([]);
  const [directoryCount, setDirectoryCount] = useState(initialDirectoryCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingOrg, setAddingOrg] = useState<string | null>(null);
  const [guessingOrg, setGuessingOrg] = useState<string | null>(null);
  const [guessedDomains, setGuessedDomains] = useState<
    Record<string, string | null>
  >({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestId = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/radar/search?q=${encodeURIComponent(q)}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as {
        hits: RadarSearchHit[];
        directoryCount: number;
      };
      if (id !== requestId.current) return;
      setHits(data.hits);
      setDirectoryCount(data.directoryCount);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Search failed");
      setHits([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void runSearch(q);
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  async function addAsProspect(hit: RadarSearchHit) {
    setAddingOrg(hit.organization_number);
    setFeedback(null);
    try {
      const guessed = guessedDomains[hit.organization_number];
      const { companyId } = await addSearchHitAsProspectAction({
        organization_number: hit.organization_number,
        name: hit.name,
        legal_form: hit.legal_form,
        county: hit.county,
        municipality: hit.municipality,
        sni_code: hit.sni_code,
        hostname: guessed ?? null,
      });
      setFeedback(`Added ${hit.name} as prospect.`);
      setHits((prev) =>
        prev.map((h) =>
          h.organization_number === hit.organization_number
            ? {
                ...h,
                in_radar: true,
                company_id: companyId,
                prospect_status: "interesting",
              }
            : h
        )
      );
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "Could not add prospect"
      );
    } finally {
      setAddingOrg(null);
    }
  }

  async function guessDomain(hit: RadarSearchHit) {
    setGuessingOrg(hit.organization_number);
    setFeedback(null);
    try {
      const result = await guessDomainForSearchHitAction({
        name: hit.name,
        organization_number: hit.organization_number,
      });
      setGuessedDomains((prev) => ({
        ...prev,
        [hit.organization_number]: result.hostname,
      }));
      setFeedback(
        result.hostname
          ? `Found domain ${result.hostname}`
          : `No domain validated (${result.tried} tried)`
      );
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "Domain lookup failed"
      );
    } finally {
      setGuessingOrg(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Search"
        description="Search the SCB company directory by name or organization number. Add hits as prospects."
      />

      <Panel>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">
              Company name or organization number
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. CTEK or 556XXX…"
              autoFocus
              className="h-10 w-full max-w-xl rounded-md border border-border-subtle bg-bg-default px-3 text-body-m text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-strong"
            />
          </label>
          <p className="text-sm text-text-tertiary">
            Directory index:{" "}
            {directoryCount === 0
              ? "empty — run “SCB directory sync” under Jobs"
              : `${directoryCount.toLocaleString("en-US")} companies`}
            {loading ? " · Searching…" : null}
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {feedback ? (
            <p className="text-sm text-text-secondary" role="status">
              {feedback}
            </p>
          ) : null}
        </div>
      </Panel>

      {query.trim().length >= 2 && !loading && hits.length === 0 ? (
        <p className="px-1 text-sm text-text-secondary">
          No matches. Try another name, or a full 10-digit organization number.
          SCB cannot be searched by name live — the directory index is required.
        </p>
      ) : null}

      {hits.length > 0 ? (
        <div className="flex flex-col gap-3">
          {hits.map((hit) => {
            const guessed = guessedDomains[hit.organization_number];
            const busyAdd = addingOrg === hit.organization_number;
            const busyGuess = guessingOrg === hit.organization_number;
            return (
              <Panel key={`${hit.source}-${hit.organization_number}`}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-heading-m text-text-primary">
                        {hit.company_id ? (
                          <Link
                            href={`${ROUTES.radarCompanies}/${hit.company_id}`}
                            className="text-text-link"
                          >
                            {hit.name}
                          </Link>
                        ) : (
                          hit.name
                        )}
                      </h2>
                      {hit.in_radar ? (
                        <Badge variant="success">In Radar</Badge>
                      ) : (
                        <Badge variant="muted">Not imported</Badge>
                      )}
                      {hit.prospect_status ? (
                        <Badge
                          variant={
                            hit.prospect_status === "interesting"
                              ? "success"
                              : "muted"
                          }
                        >
                          {hit.prospect_status}
                        </Badge>
                      ) : null}
                      {hit.source === "scb_live" ? (
                        <Badge variant="active">Live SCB</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-text-secondary">
                      {hit.organization_number_formatted}
                      {hit.legal_form ? ` · ${hit.legal_form}` : ""}
                      {hit.county ? ` · ${hit.county}` : ""}
                      {hit.municipality ? ` · ${hit.municipality}` : ""}
                    </p>
                    {hit.sni_code ? (
                      <p className="text-sm text-text-tertiary">
                        <span className="tabular-nums">{hit.sni_code}</span>
                        {hit.sni_description
                          ? ` – ${hit.sni_description}`
                          : ""}
                      </p>
                    ) : null}
                    {guessed ? (
                      <p className="text-sm text-text-secondary">
                        Domain:{" "}
                        <a
                          href={`https://${guessed}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-text-link"
                        >
                          {guessed}
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyGuess}
                      onClick={() => guessDomain(hit)}
                    >
                      {busyGuess ? "Finding…" : "Find domain"}
                    </Button>
                    {hit.prospect_status === "interesting" ? (
                      hit.company_id ? (
                        <Button size="sm" variant="secondary" asChild>
                          <Link
                            href={`${ROUTES.radarCompanies}/${hit.company_id}`}
                          >
                            Open
                          </Link>
                        </Button>
                      ) : null
                    ) : (
                      <Button
                        size="sm"
                        disabled={busyAdd}
                        onClick={() => addAsProspect(hit)}
                      >
                        {busyAdd ? "Adding…" : "Add as prospect"}
                      </Button>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
