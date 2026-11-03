/** Uses Application Default Credentials (gcloud auth application-default login or GOOGLE_APPLICATION_CREDENTIALS). */
export async function firebaseAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");
  const appSdkName = "firebase-admin/app";
  const authSdkName = "firebase-admin/auth";
  const [{ applicationDefault, getApps, initializeApp }, { getAuth }] = await Promise.all([
    import(appSdkName), import(authSdkName)
  ]);
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  return getAuth(app);
}
