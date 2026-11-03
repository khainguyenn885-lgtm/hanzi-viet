import { useEffect, useState } from "react";
import { observeAuth, firebaseConfigured, type FirebaseUser } from "./firebase-client";
import { setAuthTokenProvider, syncProfile } from "./api";

export interface UserProfile { id:string; email:string|null; phone:string|null; displayName:string; studyUid:string; role:"user"|"admin"; avatarUrl?:string; }
export function useAuthSession() {
  const [user,setUser]=useState<FirebaseUser|null>(null);
  const [profile,setProfile]=useState<UserProfile|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{if(!firebaseConfigured){setLoading(false);return;}return observeAuth(async current=>{
    setUser(current); setError("");
    if(!current){setAuthTokenProvider(null);setProfile(null);setLoading(false);return;}
    setAuthTokenProvider(()=>current.getIdToken());
    try{const result=await syncProfile();setProfile(result.profile);}
    catch(reason){setProfile(null);const code=(reason as {code?:string})?.code;setError(code==="FIREBASE_CREDENTIALS_UNAVAILABLE"?"API chưa có Google ADC. Cài Google Cloud CLI rồi chạy: gcloud auth application-default login.":code==="FIREBASE_NOT_CONFIGURED"?"API chưa được đặt FIREBASE_PROJECT_ID.":reason instanceof Error?reason.message:"Không đồng bộ được hồ sơ.");}
    finally{setLoading(false);}
  });},[]);
  return {user,profile,loading,error,setProfile};
}
