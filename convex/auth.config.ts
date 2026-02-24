const convexSiteUrl = process.env.CONVEX_SITE_URL;
if (!convexSiteUrl) {
  throw new Error(
    "Environment variable CONVEX_SITE_URL is required but was not provided."
  );
}
try {
  new URL(convexSiteUrl);
} catch {
  throw new Error(
    `Environment variable CONVEX_SITE_URL must be a valid URL, but received: "${convexSiteUrl}".`
  );
}

export default {
  providers: [
    {
      domain: convexSiteUrl,
      applicationID: "convex",
    },
  ],
};
