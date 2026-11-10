"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { BreadcrumbExtras } from "@/lib/breadcrumbs";
import { ROUTES } from "@/lib/routes";

const WorkTrailContext = createContext<{
  trail: BreadcrumbExtras | null;
  setTrail: (trail: BreadcrumbExtras | null) => void;
}>({
  trail: null,
  setTrail: () => {},
});

export function WorkTrailProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [trail, setTrail] = useState<BreadcrumbExtras | null>(null);

  useEffect(() => {
    const onWorkDeep =
      pathname.startsWith(`${ROUTES.work}/`) &&
      pathname !== ROUTES.workOverview &&
      !pathname.startsWith(`${ROUTES.workMine}`);
    if (!onWorkDeep) {
      setTrail(null);
    }
  }, [pathname]);

  const value = useMemo(() => ({ trail, setTrail }), [trail]);
  return (
    <WorkTrailContext.Provider value={value}>
      {children}
    </WorkTrailContext.Provider>
  );
}

export function useWorkTrail(): BreadcrumbExtras | null {
  return useContext(WorkTrailContext).trail;
}

export function SetWorkTrail({
  customerName,
  boardTitle,
  issueKey,
}: {
  customerName: string;
  boardTitle?: string;
  issueKey?: string;
}) {
  const { setTrail } = useContext(WorkTrailContext);

  useEffect(() => {
    setTrail({
      workCustomerName: customerName,
      workBoardTitle: boardTitle,
      workIssueKey: issueKey,
    });
    return () => setTrail(null);
  }, [boardTitle, customerName, issueKey, setTrail]);

  return null;
}
