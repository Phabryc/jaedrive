import "dotenv/config";

// In production (Docker) the real environment is supplied directly by docker-compose's
// `environment:` block and no .env file is shipped in the image - dotenv silently no-ops
// when there's nothing to load, so this is safe in both local dev and prod.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  firebaseProjectId: required("FIREBASE_PROJECT_ID"),
  firebaseServiceAccountJson: required("FIREBASE_SERVICE_ACCOUNT_JSON"),
  nodeEnv: process.env.NODE_ENV ?? "development",
};
