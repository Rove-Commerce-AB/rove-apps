import "server-only";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/appUsers";
import { workBoardHref, workIssueHref } from "@/lib/routes";
import { fetchConsultantByAppUserId } from "@/lib/consultantsQueries";
import { getCustomersForAppUser } from "@/lib/customerAppUsers";
import { getCustomerIdsForConsultant } from "@/lib/customerConsultants";
import { pgDateToDateOnlyOrNull } from "@/lib/pgDateOnly";
import { WorkInputError } from "@/lib/workErrors";
import { compareTextSv } from "@/lib/sort";
import {
  canSeeWorkBoard,
  canSeeWorkCustomer,
  canSeeWorkTime,
  type WorkActor,
} from "@/lib/workAccess";
import * as q from "@/lib/workBoardsQueries";
import {
  isValidWorkBoardPrefix,
  normalizeWorkBoardPrefix,
  workIssueKey,
  workPersonFromUser,
} from "@/lib/workIssueKey";
import type {
  WorkAccessPerson,
  WorkBoardView,
  WorkComment,
  WorkComponent,
  WorkCustomerView,
  WorkEvent,
  WorkFile,
  WorkIssue,
  WorkIssuePriority,
  WorkIssueType,
  WorkLabel,
  WorkPerson,
  WorkPreDeployAction,
  WorkProjectContext,
  WorkReference,
  WorkRequirement,
  WorkSelectorBoard,
  WorkSelectorCustomer,
  WorkSprint,
} from "@/lib/workTypes";
import {
  fetchBoardComponents,
  fetchBoardLabels,
  fetchIssueAssignees,
  fetchIssueComments,
  fetchIssueEvents,
  fetchIssueFiles,
  fetchIssueLabels,
  fetchIssuePreDeployActions,
  fetchIssueReferences,
  fetchIssueRequirements,
  fetchWorkIssueRelations,
  fetchWorkBoardMembers,
  fetchWorkAccessPickerPeople,
  fetchWorkPeopleForCustomer,
  fetchWorkUserById,
  fetchWorkIssuesForBoard,
  fetchLoggedHoursByIssueIds,
} from "@/lib/workIssuesQueries";
import {
  fetchWorkSprintsForBoard,
  mapWorkSprintRow,
} from "@/lib/workSprintsQueries";
import type { WorkBoardStatus } from "@/lib/workStatuses";
import {
  emptyWorkIssueRelations,
  groupRelationsForIssues,
} from "@/lib/workIssueRelations";

export type {
  WorkBoardView,
  WorkCustomerView,
  WorkSelectorBoard,
  WorkSelectorCustomer,
} from "@/lib/workTypes";

async function getWorkActor(): Promise<WorkActor | null> {
  const user = await getCurrentAppUser();
  if (!user || !user.appKeys.includes("work")) return null;
  return { id: user.id, role: user.role };
}

async function requireWorkActorOrRedirect(): Promise<WorkActor> {
  const actor = await getWorkActor();
  if (!actor) redirect("/access-denied");
  return actor;
}

async function requireWorkActorOrThrow(): Promise<WorkActor> {
  const actor = await getWorkActor();
  if (!actor) throw new Error("Unauthorized");
  return actor;
}

async function assignedCustomerIdsForActor(
  actor: WorkActor
): Promise<string[]> {
  if (actor.role === "admin") return [];
  return linkedCustomerIdsForActor(actor);
}

/** Customers this person is linked to. Admin is not treated as “all”. */
async function linkedCustomerIdsForActor(
  actor: WorkActor
): Promise<string[]> {
  if (actor.role === "customer") {
    const customers = await getCustomersForAppUser(actor.id);
    return customers.map((customer) => customer.id);
  }
  const ids = new Set<string>();
  for (const customer of await getCustomersForAppUser(actor.id)) {
    ids.add(customer.id);
  }
  const consultant = await fetchConsultantByAppUserId(actor.id);
  if (consultant?.id) {
    for (const id of await getCustomerIdsForConsultant(consultant.id)) {
      ids.add(id);
    }
  }
  return [...ids];
}

async function loadWorkSelectorCustomers(
  actor: WorkActor
): Promise<WorkSelectorCustomer[]> {
  const assignedIds = await assignedCustomerIdsForActor(actor);
  const customers = (
    actor.role === "admin"
      ? await q.fetchActiveCustomers()
      : await q.fetchActiveCustomersByIds(assignedIds)
  ).filter(
    (customer) => actor.role !== "customer" || !customer.is_internal
  );

  const boards = await q.fetchWorkBoardsForCustomerIds(
    customers.map((customer) => customer.id)
  );
  const boardsByCustomer = new Map<string, WorkSelectorBoard[]>();
  for (const board of boards) {
    const customer = customers.find((row) => row.id === board.customer_id);
    if (!customer) continue;
    if (
      !canSeeWorkBoard(actor, {
        customerIsInternal: customer.is_internal,
        memberAppUserIds: board.member_ids,
      })
    ) {
      continue;
    }
    const list = boardsByCustomer.get(board.customer_id) ?? [];
    list.push({ id: board.id, title: board.title, prefix: board.prefix });
    boardsByCustomer.set(board.customer_id, list);
  }

  return customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      color: customer.color,
      url: customer.url,
      isInternal: customer.is_internal,
      boards: boardsByCustomer.get(customer.id) ?? [],
    }))
    .sort(
      (a, b) =>
        Number(b.isInternal) - Number(a.isInternal) ||
        compareTextSv(a.name, b.name)
    );
}

export async function listWorkSelectorCustomers(): Promise<
  WorkSelectorCustomer[]
> {
  const actor = await requireWorkActorOrRedirect();
  return loadWorkSelectorCustomers(actor);
}

export async function listAccessibleWorkProjects(
  actor: WorkActor,
  customerId?: string
): Promise<Array<WorkSelectorBoard & { customerId: string; customerName: string }>> {
  const customers = await loadWorkSelectorCustomers(actor);
  const scopedCustomers = customerId ? customers.filter((customer) => customer.id === customerId) : customers;

  if (customerId && scopedCustomers.length === 0) throw new WorkInputError("Customer not found or access denied.");

  return scopedCustomers.flatMap((customer) => customer.boards.map((project) => ({
    ...project,
    customerId: customer.id,
    customerName: customer.name,
  })));
}

export async function listWorkNavCustomers(): Promise<WorkSelectorCustomer[]> {
  const actor = await getWorkActor();
  if (!actor) return [];
  return listAssignedWorkCustomers(actor);
}

export async function listAssignedWorkCustomers(actor: WorkActor): Promise<WorkSelectorCustomer[]> {
  const assignedIds = await linkedCustomerIdsForActor(actor);
  const customers = (
    await q.fetchActiveCustomersByIds(assignedIds)
  ).filter((customer) => actor.role !== "customer" || !customer.is_internal);

  const boards = await q.fetchWorkBoardsForCustomerIds(
    customers.map((customer) => customer.id)
  );
  const boardsByCustomer = new Map<string, WorkSelectorBoard[]>();
  for (const board of boards) {
    const customer = customers.find((row) => row.id === board.customer_id);
    if (!customer) continue;
    if (
      !canSeeWorkBoard(actor, {
        customerIsInternal: customer.is_internal,
        memberAppUserIds: board.member_ids,
      })
    ) {
      continue;
    }
    const list = boardsByCustomer.get(board.customer_id) ?? [];
    list.push({ id: board.id, title: board.title, prefix: board.prefix });
    boardsByCustomer.set(board.customer_id, list);
  }

  return customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      color: customer.color,
      url: customer.url,
      isInternal: customer.is_internal,
      boards: boardsByCustomer.get(customer.id) ?? [],
    }))
    .sort(
      (a, b) =>
        Number(b.isInternal) - Number(a.isInternal) ||
        compareTextSv(a.name, b.name)
    );
}

export async function getWorkCustomerView(
  customerId: string
): Promise<WorkCustomerView | null> {
  const actor = await requireWorkActorOrRedirect();
  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, customerId)) return null;
  const customers = await q.fetchActiveCustomersByIds([customerId]);
  const customer = customers[0];
  if (!customer) return null;

  const [boards, archivedBoards] = await Promise.all([
    q.fetchWorkBoardsForCustomerIds([customer.id]),
    q.fetchWorkBoardsForCustomerIds([customer.id], { archived: true }),
  ]);

  function visibleBoards(rows: typeof boards): WorkSelectorBoard[] {
    return rows
      .filter((board) =>
        canSeeWorkBoard(actor, {
          customerIsInternal: customer.is_internal,
          memberAppUserIds: board.member_ids,
        })
      )
      .map((board) => ({
        id: board.id,
        title: board.title,
        prefix: board.prefix,
      }));
  }

  return {
    id: customer.id,
    name: customer.name,
    color: customer.color,
    url: customer.url,
    isInternal: customer.is_internal,
    boards: visibleBoards(boards),
    archivedBoards: visibleBoards(archivedBoards),
  };
}

/** Old /work/{boardId} bookmarks become /work/{customerId}/{boardId}. */
export async function redirectIfLegacyWorkBoardUrl(
  maybeBoardId: string
): Promise<void> {
  const visible = await requireVisibleWorkBoard(maybeBoardId);
  if (!visible) return;
  redirect(workBoardHref(visible.board.customer_id, visible.board.id));
}

/** Old /work/{boardId}/{issueId} bookmarks become the nested issue URL. */
export async function redirectIfLegacyWorkIssueUrl(
  maybeBoardId: string,
  maybeIssueId: string
): Promise<void> {
  const visible = await requireVisibleWorkBoard(maybeBoardId);
  if (!visible) return;
  redirect(
    workIssueHref(
      visible.board.customer_id,
      visible.board.id,
      maybeIssueId
    )
  );
}

export async function requireVisibleWorkBoard(boardId: string, authenticatedActor?: WorkActor) {
  const actor = authenticatedActor ?? await requireWorkActorOrThrow();
  return visibleWorkBoardForActor(boardId, actor);
}

async function visibleWorkBoardForActor(boardId: string, actor: WorkActor) {
  const board = await q.fetchWorkBoardById(boardId);
  if (!board) return null;

  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, board.customer_id)) {
    return null;
  }
  if (
    !canSeeWorkBoard(actor, {
      customerIsInternal: board.customer_is_internal,
      memberAppUserIds: board.member_ids,
    })
  ) {
    return null;
  }
  return { actor, board };
}

export async function getWorkProjectContext(projectId: string, actor: WorkActor): Promise<WorkProjectContext | null> {
  const visible = await visibleWorkBoardForActor(projectId, actor);

  if (!visible) {
    return null;
  }

  const { board } = visible;
  const columns = await q.fetchWorkBoardStatuses(board.id);

  return {
    project: {
      id: board.id,
      title: board.title,
      prefix: board.prefix,
      customerId: board.customer_id,
      customerName: board.customer_name,
    },
    columns,
    agentsMd: board.agents_md,
  };
}

export async function getWorkBoardView(
  boardId: string
): Promise<WorkBoardView | null> {
  const user = await getCurrentAppUser();
  if (!user || !user.appKeys.includes("work")) redirect("/access-denied");
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) return null;
  const { actor, board } = visible;
  const showTime = canSeeWorkTime(
    actor,
    board.work_show_time_to_customer_users
  );
  const [
    issueRows,
    peopleRows,
    memberRows,
    statuses,
    boardLabels,
    boardComponents,
    sprintRows,
  ] = await Promise.all([
    fetchWorkIssuesForBoard(board.id),
    fetchWorkAccessPickerPeople(board.customer_id),
    fetchWorkBoardMembers(board.id),
    q.fetchWorkBoardStatuses(board.id),
    fetchBoardLabels(board.id),
    fetchBoardComponents(board.id),
    fetchWorkSprintsForBoard(board.id),
  ]);
  const statusIds = new Set(statuses.map((status) => status.id));
  const issueIds = issueRows.map((row) => row.id);
  const [
    assigneeRows,
    labelRows,
    commentRows,
    eventRows,
    fileRows,
    requirementRows,
    preDeployRows,
    referenceRows,
    relationRows,
    loggedHoursByIssue,
  ] = await Promise.all([
    fetchIssueAssignees(issueIds),
    fetchIssueLabels(issueIds),
    fetchIssueComments(issueIds),
    fetchIssueEvents(issueIds),
    fetchIssueFiles(issueIds),
    fetchIssueRequirements(issueIds),
    fetchIssuePreDeployActions(issueIds),
    fetchIssueReferences(issueIds),
    fetchWorkIssueRelations(board.id),
    showTime
      ? fetchLoggedHoursByIssueIds(issueIds)
      : Promise.resolve(new Map<string, number>()),
  ]);

  const people = peopleRows.map(workPersonFromUser);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const personOrFallback = (
    id: string,
    name: string | null,
    email: string
  ): WorkPerson => peopleById.get(id) ?? workPersonFromUser({ id, name, email });

  const assigneesByIssue = new Map<string, WorkPerson[]>();
  for (const row of assigneeRows) {
    const list = assigneesByIssue.get(row.issue_id) ?? [];
    list.push(workPersonFromUser(row));
    assigneesByIssue.set(row.issue_id, list);
  }
  const labelsByIssue = new Map<string, WorkLabel[]>();
  for (const row of labelRows) {
    const list = labelsByIssue.get(row.issue_id) ?? [];
    list.push({ id: row.id, name: row.name });
    labelsByIssue.set(row.issue_id, list);
  }
  const commentsByIssue = new Map<string, WorkComment[]>();
  for (const row of commentRows) {
    const list = commentsByIssue.get(row.issue_id) ?? [];
    list.push({
      id: row.id,
      body: row.body,
      createdAt: row.created_at.toISOString(),
      author: workPersonFromUser({
        id: row.author_id,
        name: row.author_name,
        email: row.author_email,
      }),
    });
    commentsByIssue.set(row.issue_id, list);
  }
  const eventsByIssue = new Map<string, WorkEvent[]>();
  for (const row of eventRows) {
    const list = eventsByIssue.get(row.issue_id) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      summary: row.summary,
      createdAt: row.created_at.toISOString(),
      actor: workPersonFromUser({
        id: row.actor_id,
        name: row.actor_name,
        email: row.actor_email,
      }),
    });
    eventsByIssue.set(row.issue_id, list);
  }
  const filesByIssue = new Map<string, WorkFile[]>();
  for (const row of fileRows) {
    const list = filesByIssue.get(row.issue_id) ?? [];
    list.push({
      id: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      createdAt: row.created_at.toISOString(),
    });
    filesByIssue.set(row.issue_id, list);
  }
  const requirementsByIssue = new Map<string, WorkRequirement[]>();
  const dodByIssue = new Map<string, WorkRequirement[]>();
  for (const row of requirementRows) {
    const item: WorkRequirement = {
      id: row.id,
      body: row.body,
      isDone: row.is_done,
      sortOrder: row.sort_order,
    };
    if (row.kind === "dod") {
      const list = dodByIssue.get(row.issue_id) ?? [];
      list.push(item);
      dodByIssue.set(row.issue_id, list);
    } else {
      const list = requirementsByIssue.get(row.issue_id) ?? [];
      list.push(item);
      requirementsByIssue.set(row.issue_id, list);
    }
  }
  const preDeployByIssue = new Map<string, WorkPreDeployAction[]>();
  for (const row of preDeployRows) {
    const list = preDeployByIssue.get(row.issue_id) ?? [];
    list.push({
      id: row.id,
      body: row.body,
      isDone: row.is_done,
      sortOrder: row.sort_order,
    });
    preDeployByIssue.set(row.issue_id, list);
  }
  const referencesByIssue = new Map<string, WorkReference[]>();
  for (const row of referenceRows) {
    const list = referencesByIssue.get(row.issue_id) ?? [];
    list.push({
      id: row.id,
      url: row.url,
      label: row.label,
      sortOrder: row.sort_order,
    });
    referencesByIssue.set(row.issue_id, list);
  }

  const sprints: WorkSprint[] = sprintRows.map(mapWorkSprintRow);

  const components: WorkComponent[] = boardComponents.map((row) => ({
    id: row.id,
    name: row.name,
  }));
  const componentById = new Map(components.map((row) => [row.id, row]));

  const issues: WorkIssue[] = issueRows
    .filter((row) => statusIds.has(row.status))
    .map((row) => ({
      id: row.id,
      number: row.number,
      key: workIssueKey(board.prefix, row.number),
      title: row.title,
      status: row.status,
      sortOrder: row.sort_order,
      issueType: (row.issue_type === "bug" ? "bug" : "issue") as WorkIssueType,
      component: row.component_id
        ? (componentById.get(row.component_id) ??
          (row.component_name
            ? { id: row.component_id, name: row.component_name }
            : null))
        : null,
      description: row.description,
      currentState: row.current_state,
      nextStep: row.next_step,
      outOfScope: row.out_of_scope,
      priority: (row.priority as WorkIssuePriority | null) ?? null,
      owner: row.owner_app_user_id
        ? personOrFallback(
            row.owner_app_user_id,
            row.owner_name,
            row.owner_email ?? ""
          )
        : null,
      reporter: row.created_by_app_user_id
        ? personOrFallback(
            row.created_by_app_user_id,
            row.reporter_name,
            row.reporter_email ?? ""
          )
        : null,
      assignees: assigneesByIssue.get(row.id) ?? [],
      labels: labelsByIssue.get(row.id) ?? [],
      comments: commentsByIssue.get(row.id) ?? [],
      events: eventsByIssue.get(row.id) ?? [],
      files: filesByIssue.get(row.id) ?? [],
      requirements: requirementsByIssue.get(row.id) ?? [],
      definitionOfDone: dodByIssue.get(row.id) ?? [],
      preDeployActions: preDeployByIssue.get(row.id) ?? [],
      references: referencesByIssue.get(row.id) ?? [],
      relations: emptyWorkIssueRelations(),
      estimateHours: showTime
        ? row.estimate_hours == null
          ? null
          : Number(row.estimate_hours)
        : null,
      loggedHours: showTime ? loggedHoursByIssue.get(row.id) ?? 0 : 0,
      sprintId: row.sprint_id,
      startDate: pgDateToDateOnlyOrNull(row.start_date),
      dueDate: pgDateToDateOnlyOrNull(row.due_date),
    }));

  const doneByStatus = new Map(
    statuses.map((status) => [status.id, status.isDone])
  );
  const relationRefs = new Map(
    issues.map((issue) => [
      issue.id,
      {
        id: issue.id,
        key: issue.key,
        title: issue.title,
        status: issue.status,
        isDone: doneByStatus.get(issue.status) ?? false,
      },
    ])
  );
  const relationsByIssue = groupRelationsForIssues(
    issues.map((issue) => issue.id),
    relationRows.map((row) => ({
      id: row.id,
      boardId: row.project_id,
      fromIssueId: row.from_issue_id,
      toIssueId: row.to_issue_id,
      kind: row.kind,
    })),
    relationRefs
  );
  for (const issue of issues) {
    issue.relations = relationsByIssue.get(issue.id) ?? emptyWorkIssueRelations();
  }

  return {
    id: board.id,
    title: board.title,
    prefix: board.prefix,
    agentsMd: board.agents_md,
    customerId: board.customer_id,
    customerName: board.customer_name,
    plannerProjectId: board.planner_project_id ?? null,
    plannerProjectName: board.planner_project_name ?? null,
    showTime,
    currentUser: workPersonFromUser({
      id: user.id,
      name: user.name,
      email: user.email,
    }),
    people,
    members: memberRows.map(workPersonFromUser),
    statuses,
    boardLabels,
    components,
    issues,
    sprints,
  };
}

export async function listWorkCustomerPeople(
  customerId: string
): Promise<WorkPerson[]> {
  const actor = await requireWorkActorOrThrow();
  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, customerId)) {
    throw new Error("Unauthorized");
  }
  const rows = await fetchWorkPeopleForCustomer(customerId);
  return rows.map(workPersonFromUser);
}

export type { WorkAccessPerson } from "@/lib/workTypes";

export async function listWorkAccessPeople(
  customerId: string
): Promise<WorkAccessPerson[]> {
  const actor = await requireWorkActorOrThrow();
  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, customerId)) {
    throw new Error("Unauthorized");
  }
  const rows = await fetchWorkAccessPickerPeople(customerId);
  return rows.map((row) => ({
    ...workPersonFromUser(row),
    onCustomer: row.on_customer,
  }));
}

export async function createWorkBoardStatus(
  boardId: string,
  name: string
): Promise<WorkBoardStatus> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Status name is required");
  return q.insertWorkBoardStatus({ boardId, name: trimmed });
}

export async function renameWorkBoardStatus(
  boardId: string,
  statusId: string,
  name: string
): Promise<WorkBoardStatus> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Status name is required");
  return q.renameWorkBoardStatus({ boardId, statusId, name: trimmed });
}

export async function reorderWorkBoardStatuses(
  boardId: string,
  statusIds: string[]
): Promise<void> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  await q.reorderWorkBoardStatuses(boardId, statusIds);
}

export async function deleteWorkBoardStatus(
  boardId: string,
  statusId: string,
  moveToStatusId: string | null
): Promise<void> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  await q.deleteWorkBoardStatus({
    boardId,
    statusId,
    moveToStatusId,
    actorAppUserId: visible.actor.id,
  });
}

export async function addWorkBoardMember(
  boardId: string,
  appUserId: string
): Promise<void> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  const allowed = await fetchWorkUserById(appUserId);
  if (!allowed) {
    throw new Error("That person does not have access to Work");
  }
  await q.insertWorkBoardMember(boardId, appUserId);
}

export async function removeWorkBoardMember(
  boardId: string,
  appUserId: string
): Promise<void> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  if (visible.board.member_ids.length <= 1) {
    throw new Error("A board needs at least one person");
  }
  await q.deleteWorkBoardMember(boardId, appUserId);
}

export async function renameWorkBoard(
  boardId: string,
  title: string
): Promise<{ title: string; customerId: string }> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title is required");
  const nextTitle = await q.renameWorkBoard(boardId, trimmed);
  return { title: nextTitle, customerId: visible.board.customer_id };
}

export async function saveWorkProjectInstructions(projectId: string, agentsMd: string): Promise<string> {
  if (typeof agentsMd !== "string") {
    throw new Error("Project instructions must be text");
  }

  const visible = await requireVisibleWorkBoard(projectId);

  if (!visible) {
    throw new Error("Project not found");
  }

  return q.updateWorkProjectInstructions(projectId, agentsMd);
}

export async function archiveWorkBoard(boardId: string): Promise<string> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Board not found");
  await q.archiveWorkBoard(boardId);
  return visible.board.customer_id;
}

export async function restoreWorkBoard(boardId: string): Promise<string> {
  const actor = await requireWorkActorOrThrow();
  const board = await q.fetchArchivedWorkBoardById(boardId);
  if (!board) throw new Error("Board not found");
  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, board.customer_id)) {
    throw new Error("Board not found");
  }
  if (
    !canSeeWorkBoard(actor, {
      customerIsInternal: board.customer_is_internal,
      memberAppUserIds: board.member_ids,
    })
  ) {
    throw new Error("Board not found");
  }
  await q.restoreWorkBoard(boardId);
  return board.customer_id;
}

export async function createWorkBoard(
  customerId: string,
  title: string,
  prefixInput: string,
  memberAppUserIds?: string[],
  plannerProjectId?: string | null
): Promise<string> {
  const actor = await requireWorkActorOrThrow();
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Title is required");
  }
  const prefix = normalizeWorkBoardPrefix(prefixInput);
  if (!isValidWorkBoardPrefix(prefix)) {
    throw new Error("Prefix must be 2–8 letters or numbers, starting with a letter");
  }

  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, customerId)) {
    throw new Error("Unauthorized");
  }

  const customers =
    actor.role === "admin"
      ? await q.fetchActiveCustomers()
      : await q.fetchActiveCustomersByIds(assignedIds);
  const customer = customers.find((row) => row.id === customerId);
  if (!customer) {
    throw new Error("Customer not found");
  }

  const customerPeople = await fetchWorkPeopleForCustomer(customerId);
  const customerPeopleIds = new Set(customerPeople.map((row) => row.id));
  const requestedIds = [
    ...new Set(memberAppUserIds ?? customerPeople.map((row) => row.id)),
  ];
  const allowedRows = await Promise.all(
    requestedIds.map((id) => fetchWorkUserById(id))
  );
  const requested = requestedIds.filter((id, index) => {
    if (id === actor.id) return true;
    if (customerPeopleIds.has(id)) return true;
    return allowedRows[index] != null;
  });

  try {
    return await q.insertWorkBoard({
      customerId,
      title: trimmed,
      prefix,
      createdByAppUserId: actor.id,
      memberAppUserIds: requested,
      plannerProjectId: plannerProjectId ?? null,
    });
  } catch (error) {
    const maybePg = error as { code?: string; constraint?: string };
    if (
      maybePg.code === "23505" &&
      (maybePg.constraint === "work_projects_customer_prefix_idx" ||
        maybePg.constraint === "work_boards_customer_prefix_idx")
    ) {
      throw new Error("That prefix is already used on another project for this customer");
    }
    if (
      maybePg.code === "23505" &&
      maybePg.constraint === "work_projects_planner_project_uidx"
    ) {
      throw new Error("That customer project already has a Work project");
    }
    throw error;
  }
}

export async function listLinkablePlannerProjects(
  customerId: string
): Promise<{ id: string; name: string }[]> {
  const actor = await requireWorkActorOrThrow();
  const assignedIds = await assignedCustomerIdsForActor(actor);
  if (!canSeeWorkCustomer(actor, assignedIds, customerId)) {
    throw new Error("Unauthorized");
  }
  return q.fetchLinkablePlannerProjects(customerId);
}

export async function linkWorkProjectToPlannerProject(
  boardId: string,
  plannerProjectId: string
): Promise<{ plannerProjectId: string; plannerProjectName: string }> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new Error("Unauthorized");
  const { board } = visible;
  if (board.planner_project_id) {
    throw new Error("This Work project is already linked to a customer project");
  }
  const trimmed = plannerProjectId.trim();
  if (!trimmed) throw new Error("Select a customer project");

  try {
    return await q.linkWorkBoardToPlannerProject(board.id, trimmed);
  } catch (error) {
    const maybePg = error as { code?: string; constraint?: string; message?: string };
    if (
      maybePg.code === "23505" &&
      maybePg.constraint === "work_projects_planner_project_uidx"
    ) {
      throw new Error("That customer project already has a Work project");
    }
    if (
      error instanceof Error &&
      error.message === "Could not link project"
    ) {
      throw new Error(
        "Customer project not found, inactive, or already linked elsewhere"
      );
    }
    throw error;
  }
}

export async function setWorkProjectPreferredView(
  projectId: string,
  view: "board" | "sprint" | "timeline"
): Promise<void> {
  const actor = await requireWorkActorOrThrow();
  const visible = await requireVisibleWorkBoard(projectId);
  if (!visible) throw new Error("Unauthorized");
  await q.updateMemberPreferredView(projectId, actor.id, view);
}

export async function getWorkProjectPreferredView(
  projectId: string
): Promise<"board" | "sprint" | "timeline" | null> {
  const actor = await getWorkActor();
  if (!actor) return null;
  return q.fetchMemberPreferredView(projectId, actor.id);
}
