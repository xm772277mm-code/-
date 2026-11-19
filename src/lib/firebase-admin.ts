import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  const projectId = (firebaseConfig?.projectId || "").trim();
  if (!projectId || projectId === "remixed-project-id") {
    throw new Error("Firebase projectId is missing in firebase-applet-config.json");
  }
  return initializeApp({ projectId });
}

export const adminAuth = getAuth(getFirebaseAdminApp());
