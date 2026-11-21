const nextConfig = {
  // Feature/bug screenshots on create (up to 8 × 8 MB).
  // bodySizeLimit remains under experimental in Next 16.
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
  },
  // unzipper optionally requires @aws-sdk/client-s3; keep it external so
  // Turbopack does not try to resolve that unused path.
  serverExternalPackages: ["unzipper"],
  async redirects() {
    return [
      { source: "/clients", destination: "/settings/customers", permanent: false },
      { source: "/kunder", destination: "/settings/customers", permanent: false },
      { source: "/customers", destination: "/settings/customers", permanent: false },
      {
        source: "/customers/:id",
        destination: "/settings/customers/:id",
        permanent: false,
      },
      { source: "/konsulter", destination: "/settings/people", permanent: false },
      { source: "/consultants", destination: "/settings/people", permanent: false },
      {
        source: "/konsulter/:id",
        destination: "/settings/consultants/:id",
        permanent: false,
      },
      {
        source: "/consultants/:id",
        destination: "/settings/consultants/:id",
        permanent: false,
      },
      // Planner plan grids (legacy → /planner/plan/*)
      {
        source: "/planner",
        destination: "/planner/plan/consultant",
        permanent: true,
      },
      {
        source: "/planner/consultant",
        destination: "/planner/plan/consultant",
        permanent: true,
      },
      {
        source: "/planner/customer",
        destination: "/planner/plan/customer",
        permanent: true,
      },
      {
        source: "/planner/project",
        destination: "/planner/plan/project",
        permanent: true,
      },
      {
        source: "/planner/history",
        destination: "/planner/plan/history",
        permanent: true,
      },
      {
        source: "/planner/overview",
        destination: "/planner/plan/consultant",
        permanent: true,
      },
      {
        source: "/planner/allocation",
        destination: "/planner/plan/consultant",
        permanent: true,
      },
      { source: "/allokering", destination: "/planner/plan/consultant", permanent: true },
      { source: "/allocation", destination: "/planner/plan/consultant", permanent: true },
      // Projects list removed — send to project plan grid
      { source: "/projekt", destination: "/planner/plan/project", permanent: true },
      { source: "/projects", destination: "/planner/plan/project", permanent: true },
      {
        source: "/projects/:id",
        destination: "/planner/projects/:id",
        permanent: true,
      },
      {
        source: "/time-report/project-manager",
        destination: "/time-report/approval",
        permanent: false,
      },
      { source: "/inställningar", destination: "/settings/general", permanent: false },
      { source: "/settings", destination: "/settings/general", permanent: false },
    ];
  },
};

export default nextConfig;
