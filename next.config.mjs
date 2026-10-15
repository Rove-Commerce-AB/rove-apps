const nextConfig = {
  // Feature/bug screenshots on create (up to 8 × 8 MB).
  serverActions: {
    bodySizeLimit: "40mb",
  },
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
      { source: "/projekt", destination: "/projects", permanent: false },
      { source: "/allokering", destination: "/planner/consultant", permanent: false },
      { source: "/allocation", destination: "/planner/consultant", permanent: false },
      { source: "/planner", destination: "/planner/consultant", permanent: false },
      {
        source: "/planner/allocation",
        destination: "/planner/consultant",
        permanent: false,
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
