IMPORTANT:
This document defines mandatory rules for this project.
All AI-generated code must follow these rules.

Rove Apps – Architecture & Development Guidelines

Detta dokument beskriver arkitekturprinciper, struktur och regler för utvecklingen av Rove Apps.
Planner och Time report är appar inuti Rove Apps.
Syftet är att hålla koden enkel, konsekvent och lätt att vidareutveckla, även för icke-tekniska utvecklare med AI-stöd (Cursor).

1. Övergripande mål
Enkel att förstå
Låg komplexitet
Förutsägbar struktur
Skalbar till ~50 användare utan ombyggnad
AI-vänlig kodbas (Cursor, Copilot m.fl.)

2. Teknikstack
Frontend: Next.js (App Router)
UI: React + TypeScript
Styling: Tailwind CSS
Backend: Next.js (Server Components, server actions) + `src/lib/` med `pg` mot PostgreSQL
Databas: PostgreSQL (Google Cloud SQL)
Auth: Auth.js (NextAuth) med Google (personal) + e-post/lösenord för `customer`; `app_users` i samma databas
Hosting: Google Cloud Run
Versionering: Git + GitHub

3. Arkitekturprinciper
3.1 Separation of concerns
UI-komponenter innehåller ingen affärslogik
Datakommunikation sker via lib/
Pages ansvarar för:
datahämtning
state
rendering

3.2 Server vs Client Components
Server Components (default):
listing
read-only vyer
Client Components ("use client"):
formulär
modaler
interaktivitet
Använd Client Components endast när det krävs.

3.3 Ingen affärslogik i UI
Ingen beräkning av beläggning i komponenter
Ingen SQL i pages
Ingen komplex logik i JSX

4. Mappstruktur (principer)
src/
  app/            → routing & pages
  components/     → återanvändbara UI-komponenter
  lib/            → datalager, clients, helpers
  types/          → TypeScript-typer

Regler:
Ingen “dump”-mapp
En fil = ett tydligt ansvar
Undvik djupa nästlade strukturer

5. Datamodell – grundprinciper
Kärnentiteter:
clients
projects (tillhör client)
consultants
allocations
roles
calendars
holidays

Relationer:
client → många projects
consultant → många allocations
allocation → exakt en consultant + ett project + en role
consultant → exakt en calendar

6. Databasprinciper (PostgreSQL / Cloud SQL)
PostgreSQL är source of truth
Alla tabeller:
id (uuid)
created_at
updated_at
Soft deletes används vid behov (is_active)
Säkerhet
Åtkomst sker via servern (Auth.js-session + kontroller i `lib/`); ingen direkt DB från webbläsaren
Anslutning: `CLOUD_SQL_URL` (se `src/lib/cloudSqlPool.ts`)
Första versionen: single-tenant
Senare: org_id på alla tabeller (vid behov)

7. Dataåtkomst
All databasåtkomst sker via `src/lib/` (query-moduler + tunna wrappers), anropade från Server Components eller server actions.
Exempel:
lib/customers.ts
lib/projects.ts
lib/allocations.ts
Pages och klientkomponenter får inte öppna egna databasanslutningar utanför det mönstret.

8. UI-principer
Visuella regler (färg, typografi, radie, skuggor, accent per app) står i doc/DESIGN_SYSTEM.md och doc/UI_PATTERNS.md – de vinner över äldre token-namn i koden.
Dashboard/Home är read-only
CRUD sker via formulär och modaler
Tabellen är “dum” → får färdig data
Accordion & scroll prioriteras framför pagination

9. Allokering & tid
Allokering lagras per vecka
Vecka representeras som:
year
week
Veckointervall skapas via batch-insert
Historik raderas aldrig

10. Kodkonventioner
TypeScript överallt
Inga any
Namn:
tabeller: plural, snake_case
filer: camelCase
komponenter: PascalCase
Hellre tydlig kod än “smart” kod

11. AI-arbetsprincip (Cursor)
Små förändringar per prompt
En feature i taget
Be alltid om:
full fil
inte diff
Bekräfta efter varje större steg

12. Utvecklingsordning (rekommenderad)
Clients (CRUD)
Projects (kopplade till client)
Consultants
Roles
Calendars
Allocations
Dashboard aggregation
Auth & rättigheter

13. Medvetna förenklingar (MVP)
Ingen real-time sync
Ingen offline-support
Ingen avancerad rättighetsmodell
Ingen fakturering i v1

14. Princip att alltid följa
“Make it boring, predictable and easy to change.”

15. Språk
Hela sajten skall vara på engelska, inklusive produktnamnet **Rove Apps**. Det är endast skärmdumparna som är på svenska, men dessa ska översättas. Även kod och all namnstandard ska vara engelska.
Använd "customer" och inte "client"