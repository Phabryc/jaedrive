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
