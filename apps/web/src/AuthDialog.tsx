import { useState } from "react";
import { confirmPhoneOtp, firebaseConfigured, registerEmail, requestPhoneOtp, signInEmail, signInFacebook } from "./firebase-client";

export function AuthDialog({onClose}:{onClose:()=>void}) {
  const [mode,setMode]=useState<"email"|"phone">("email");const [register,setRegister]=useState(false);
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [phone,setPhone]=useState("");const [otp,setOtp]=useState("");
  const [otpSent,setOtpSent]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function run(action:()=>Promise<unknown>){setBusy(true);setMessage("");try{await action();onClose();}catch(error){setMessage(friendlyError(error));}finally{setBusy(false);}}
  async function submit(event:React.FormEvent){event.preventDefault();if(mode==="phone"&&!otpSent){setBusy(true);setMessage("");try{await requestPhoneOtp(phone,"phone-recaptcha");setOtpSent(true);setMessage("Đã gửi mã OTP. Hãy kiểm tra điện thoại.");}catch(error){setMessage(friendlyError(error));}finally{setBusy(false);}return;}await run(async()=>{if(mode==="phone")await confirmPhoneOtp(otp);else if(register)await registerEmail(email,password);else await signInEmail(email,password);});}
  return <div className="auth-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="auth-dialog panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button className="close-detail" onClick={onClose} aria-label="Đóng">×</button><p className="eyebrow">HỌC TẬP ĐỒNG BỘ AN TOÀN</p><h2 id="auth-title">Đăng nhập để lưu tiến độ</h2>
    {!firebaseConfigured&&<div className="setup-notice"><b>Firebase Web chưa được cấu hình.</b><p>Đặt các biến `VITE_FIREBASE_*` trong file `.env.local`, rồi khởi động lại web.</p></div>}
    <div className="auth-modes"><button className={mode==="email"?"selected":""} onClick={()=>setMode("email")}>Email</button><button className={mode==="phone"?"selected":""} onClick={()=>{setMode("phone");setOtpSent(false);}}>Điện thoại</button></div>
    <form className="auth-form" onSubmit={submit}>
      {mode==="email"?<><label>Email<input type="email" required autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="ban@email.com"/></label><label>Mật khẩu<input type="password" required minLength={6} autoComplete={register?"new-password":"current-password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder="Ít nhất 6 ký tự"/></label></>:
      <><label>Số điện thoại<input type="tel" required disabled={otpSent} value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+84901234567"/></label>{otpSent&&<label>Mã SMS<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event=>setOtp(event.target.value)} required placeholder="Nhập mã xác minh"/></label>}<div id="phone-recaptcha"/></>}
      {message&&<p className="notice" role="status">{message}</p>}{!firebaseConfigured&&message&&<p className="error-message">{message}</p>}
      <button className="button primary auth-submit" disabled={!firebaseConfigured||busy}>{busy?"Đang xử lý…":mode==="phone"?(otpSent?"Xác minh mã":"Gửi mã OTP"):register?"Tạo tài khoản":"Đăng nhập"}</button>
    </form>
    {mode==="email"&&<button className="text-button auth-switch" onClick={()=>setRegister(value=>!value)}>{register?"Đã có tài khoản? Đăng nhập":"Tạo tài khoản bằng email"}</button>}
    <button className="button secondary auth-facebook" disabled={!firebaseConfigured||busy} onClick={()=>void run(signInFacebook)}>Tiếp tục với Facebook</button>
    <small className="auth-privacy">Tiến độ được lưu trong SQLite của máy chạy app. Backend cần ADC trước khi có thể đồng bộ hồ sơ Firebase.</small>
  </section></div>;
}
function friendlyError(error:unknown){const code=(error as {code?:string})?.code;const known:Record<string,string>={"auth/invalid-credential":"Email/mật khẩu không đúng.","auth/email-already-in-use":"Email đã được đăng ký.","auth/weak-password":"Mật khẩu cần ít nhất 6 ký tự.","auth/invalid-phone-number":"Số điện thoại cần ở dạng quốc tế, ví dụ +84901234567.","auth/invalid-verification-code":"Mã xác minh không đúng.","auth/popup-blocked":"Trình duyệt đã chặn cửa sổ đăng nhập.","FIREBASE_WEB_NOT_CONFIGURED":"Firebase Web chưa cấu hình.","FIREBASE_NOT_CONFIGURED":"Backend chưa cấu hình Firebase project/ADC."};return known[code??""]??(error instanceof Error?error.message:"Không thể đăng nhập lúc này.");}
