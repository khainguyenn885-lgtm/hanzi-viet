import { getApp, getApps, initializeApp } from "firebase/app";
import { FacebookAuthProvider, RecaptchaVerifier, createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  sendEmailVerification, signInWithEmailAndPassword, signInWithPhoneNumber, signInWithPopup, signOut, type ConfirmationResult, type User } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
};
export const firebaseConfigured = Object.values(config).every(value => typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_"));
export const firebaseAuth = firebaseConfigured ? getAuth(getApps().length ? getApp() : initializeApp(config)) : null;
export type FirebaseUser = User;

export function observeAuth(callback: (user: User | null) => void) {
  if (!firebaseAuth) return () => {};
  return onAuthStateChanged(firebaseAuth, callback);
}
export async function signInEmail(email: string, password: string) { if (!firebaseAuth) throw new Error("FIREBASE_WEB_NOT_CONFIGURED"); return signInWithEmailAndPassword(firebaseAuth,email,password); }
export async function registerEmail(email: string, password: string) {
  if (!firebaseAuth) throw new Error("FIREBASE_WEB_NOT_CONFIGURED");
  const result=await createUserWithEmailAndPassword(firebaseAuth,email,password); await sendEmailVerification(result.user); return result;
}
export async function signInFacebook() { if (!firebaseAuth) throw new Error("FIREBASE_WEB_NOT_CONFIGURED"); const provider=new FacebookAuthProvider(); provider.addScope("email"); return signInWithPopup(firebaseAuth,provider); }
let confirmation: ConfirmationResult | null = null;
let recaptcha: RecaptchaVerifier | null = null;
export async function requestPhoneOtp(phone: string, containerId: string) {
  if (!firebaseAuth) throw new Error("FIREBASE_WEB_NOT_CONFIGURED");
  recaptcha?.clear(); recaptcha=new RecaptchaVerifier(firebaseAuth,containerId,{size:"invisible"});
  confirmation=await signInWithPhoneNumber(firebaseAuth,phone,recaptcha);
}
export async function confirmPhoneOtp(code: string) { if (!confirmation) throw new Error("OTP_NOT_REQUESTED"); const result=await confirmation.confirm(code); confirmation=null; recaptcha?.clear(); recaptcha=null; return result; }
export async function signOutCurrentUser() { if (firebaseAuth) await signOut(firebaseAuth); }
