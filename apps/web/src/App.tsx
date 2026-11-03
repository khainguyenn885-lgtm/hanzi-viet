import { useEffect, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import { analyze, findWord, getWritingCharacters, searchWords, sendFeedback, getSavedWords, getDueWords, getUserStats, saveWord, unsaveWord, submitReview } from "./api";
import type { AnalyzedToken, WordRecord } from "./types";
import { nextStrokeMode, type StrokeMode } from "./stroke-practice";
import { useAuthSession } from "./auth-session";
import { signOutCurrentUser } from "./firebase-client";
import { AuthDialog } from "./AuthDialog";
import { AdminDashboard } from "./AdminDashboard";
import { LibraryDashboard } from "./LibraryDashboard";
import { AchievementsDashboard, StudyCommunityDashboard } from "./community";
import { useActiveTimeTracker } from "./use-active-time";
import { SocialHub } from "./SocialHub";

type Tab = "dictionary" | "write" | "review" | "feedback" | "stats" | "groups" | "social" | "library" | "admin";
const MISSING = "Chưa có dữ liệu";

export default function App() {
  const [tab, setTab] = useState<Tab>("dictionary");
  const {user,profile,loading:authLoading,error:authError}=useAuthSession();
  const [showAuth,setShowAuth]=useState(false);const [stats,setStats]=useState<{learnedToday:number;mastered:number;reviewing:number;streak:number}|null>(null);
  const [sessionError,setSessionError]=useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("hanzi-dark") === "true");
  const [target, setTarget] = useState<"vi" | "en">("vi");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); const [level, setLevel] = useState(0);
  const [searchResults, setSearchResults] = useState<WordRecord[]>([]);
  const [tokens, setTokens] = useState<AnalyzedToken[]>([]);
  const [sentenceTranslation, setSentenceTranslation] = useState<{ available:boolean; sentenceZh:string; meaningVi:string; meaningEn:string; source:string|null } | null>(null);
  const [selected, setSelected] = useState<AnalyzedToken | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [reviewWords, setReviewWords] = useState<WordRecord[]>([]);
  const [flipped, setFlipped] = useState(false); const [reviewNotice, setReviewNotice] = useState("");
  useActiveTimeTracker(Boolean(profile));

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("hanzi-dark", String(dark)); }, [dark]);
  useEffect(() => { const timer = window.setTimeout(() => { if (!query.trim()) { setSearchResults([]); return; } searchWords(query.trim(), level).then(result => setSearchResults(result.words)).catch(() => setError("Không tìm được dữ liệu từ điển cục bộ.")); }, 120); return () => window.clearTimeout(timer); }, [query, level]);
  useEffect(()=>{let alive=true;if(!user||!profile){setSavedIds([]);setReviewWords([]);setStats(null);return()=>{alive=false;};}
    Promise.all([getSavedWords(),getUserStats()]).then(([saved,summary])=>{if(!alive)return;setSavedIds(saved.words.map(word=>word.id));setStats(summary.metrics);}).catch(reason=>{if(alive)setSessionError(reason instanceof Error?reason.message:"Không tải được dữ liệu tài khoản.");});
    return()=>{alive=false;};},[user,profile]);
  useEffect(()=>{if(window.location.pathname!=="/admin"||authLoading)return;if(!profile){setShowAuth(true);setTab("dictionary");window.history.replaceState({},"","/");}else if(profile.role==="admin")setTab("admin");else{setTab("dictionary");setSessionError("Bạn không có quyền quản trị.");window.history.replaceState({},"","/");}},[profile,authLoading]);
  useEffect(()=>{if(!profile&&["review","stats","groups","social","library","admin"].includes(tab)){setTab("dictionary");window.history.replaceState({},"","/");}},[profile,tab]);
  const refreshDue=async()=>{const response=await getDueWords();setReviewWords(response.words);};
  useEffect(()=>{if(tab!=="review"||!profile)return;let alive=true;getDueWords().then(data=>{if(alive)setReviewWords(data.words);}).catch(error=>setSessionError(error instanceof Error?error.message:"Không tải được thẻ ôn."));const timer=window.setInterval(()=>{void getDueWords().then(data=>{if(alive)setReviewWords(data.words);});},30_000);return()=>{alive=false;window.clearInterval(timer);};},[tab,profile]);
  const dueCards = reviewWords;

  async function runAnalyze() {
    setBusy(true); setError(""); setSelected(null);
    try { const result = await analyze(input); setTokens(result.tokens); setSentenceTranslation(result.sentenceTranslation); }
    catch (e) { setError(e instanceof Error ? e.message : "Không thể tra cứu đoạn văn."); }
    finally { setBusy(false); }
  }
  async function openToken(token: AnalyzedToken) {
    setSelected(token);
    if (token.isChinese && !token.word) {
      try { const response = await findWord(token.surface); setSelected({ ...token, word: response.word }); }
      catch { /* Unknown words remain visible as missing data. */ }
    }
  }
  const words = tokens.filter(token => token.isChinese);
  function chooseWord(word: WordRecord) { setSelected({ surface: word.hanzi, pinyin: word.pinyin, isChinese: true, needsReview: false, word, matches: [word] }); }
  async function toggleSave(word: WordRecord) { if(!profile){setShowAuth(true);throw new Error("AUTH_REQUIRED");} if(savedIds.includes(word.id))await unsaveWord(word.id);else await saveWord(word.id);const saved=await getSavedWords();setSavedIds(saved.words.map(row=>row.id));setSessionError(""); }
  async function answerCard(remembered: boolean) { const card = dueCards[0]; if (!card||!profile) return; try{await submitReview(card.id,remembered,Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Ho_Chi_Minh");setReviewNotice(remembered ? "Đã nhớ — thẻ sẽ quay lại sau 24 giờ." : "Chưa nhớ — thẻ sẽ quay lại sau 5 phút.");setFlipped(false);await Promise.all([refreshDue(),getUserStats().then(data=>setStats(data.metrics))]);}catch(error){setSessionError(error instanceof Error?error.message:"Không lưu được lượt ôn.");} }
  function navigate(next:Tab){if(["review","stats","groups","social","library","admin"].includes(next)&&!profile){setShowAuth(true);return;}if(next==="admin"&&profile?.role!=="admin"){setSessionError("Bạn không có quyền quản trị.");return;}setTab(next);setSessionError("");window.history.pushState({},"",next==="dictionary"?"/":next==="admin"?"/admin":`/${next}`);}
  async function logout(){setTab("dictionary");window.history.replaceState({},"","/");await signOutCurrentUser();}
  useEffect(() => { if (tab !== "review") return; const listener = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; if (event.code === "Space") { event.preventDefault(); setFlipped(value => !value); } if (event.key === "ArrowRight") answerCard(true); if (event.key === "ArrowLeft") answerCard(false); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [tab, dueCards]);

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark">汉</span><span>HocTiengTrung<span className="brand-accent">CungKhai</span><small>HỌC CHỮ, HIỂU NGHĨA</small></span></a>
      <nav className="main-nav" aria-label="Chức năng"><button className={tab === "dictionary" ? "nav-item active" : "nav-item"} onClick={() => navigate("dictionary")}>Từ điển</button><button className={tab === "write" ? "nav-item active" : "nav-item"} onClick={() => navigate("write")}>Luyện viết</button><button className={tab === "review" ? "nav-item active" : "nav-item"} onClick={() => navigate("review")}>Ôn tập ({savedIds.length})</button><button className={tab === "feedback" ? "nav-item active" : "nav-item"} onClick={() => navigate("feedback")}>Góp ý</button><button className={tab === "library" ? "nav-item active" : "nav-item"} onClick={() => navigate("library")}>Thư viện {profile?"":"🔒"}</button><button className={tab === "stats" ? "nav-item active" : "nav-item"} onClick={() => navigate("stats")}>Chuỗi {profile?`${stats?.streak??0} ngày`:"🔒"}</button><button className={tab === "groups" ? "nav-item active" : "nav-item"} onClick={() => navigate("groups")}>Nhóm {profile?"":"🔒"}</button><button className={tab === "social" ? "nav-item active" : "nav-item"} onClick={() => navigate("social")}>Bạn bè & chat {profile?"":"🔒"}</button>{profile?.role==="admin"&&<button className={tab === "admin" ? "nav-item active" : "nav-item"} onClick={() => navigate("admin")}>Quản trị</button>}</nav>
      <div className="account-actions">{profile?<><span className="account-badge" title={`Study UID ${profile.studyUid}`}>{profile.displayName||profile.email||"Thành viên"}<small>{profile.studyUid}</small></span><button className="text-button" onClick={()=>void logout()}>Đăng xuất</button></>:<button className="button secondary login-button" onClick={()=>setShowAuth(true)}>{authLoading?"Đang tải…":"Đăng nhập"}</button>}</div>
      <button className="theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? "Bật chế độ sáng" : "Bật chế độ tối"}>{dark ? "☀" : "◐"}<span>{dark ? "Sáng" : "Tối"}</span></button>
    </header>
    {(authError||sessionError)&&<p className="session-error" role="alert">{authError||sessionError}</p>}

    {tab === "social" ? null : tab === "dictionary" ? <section className="page-grid">
      <div className="primary-column">
        <div className="welcome"><div><p className="eyebrow">TỪ ĐIỂN CỤC BỘ HSK 3.0</p><h1>Tra cứu,<br/><em>hiểu từng từ.</em></h1><p className="subhead">Tìm bằng chữ Hán, Pinyin, tiếng Việt hoặc tiếng Anh. Nội dung được tra từ dữ liệu tĩnh của app.</p></div><div className="hero-seal">学<span>习</span></div></div>
        <section className="panel input-panel">
          <div className="panel-heading"><div><span className="step-number">01</span><h2>Tra từ điển</h2></div><span className="small-note">Không gửi truy vấn ra dịch vụ ngoài</span></div>
          <input className="dictionary-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="汉字 · Pinyin (nǐ hǎo / ni3 hao3) · tiếng Việt · English" aria-label="Tìm trong từ điển" />
          <div className="search-controls"><label>HSK <select value={level} onChange={e => setLevel(Number(e.target.value))}><option value={0}>Tất cả cấp</option>{[1,2,3,4,5,6].map(n => <option value={n} key={n}>Cấp {n}</option>)}<option value={7}>Cấp 7–9 (nguồn gộp)</option></select></label><div className="language-pills"><span>Ưu tiên nghĩa</span><button className={target === "vi" ? "selected" : ""} onClick={() => setTarget("vi")}>Việt</button><button className={target === "en" ? "selected" : ""} onClick={() => setTarget("en")}>English</button></div></div>
          {query.trim() && <div className="dictionary-results">{searchResults.length ? searchResults.map(word => <button key={word.id} className="dictionary-result" onClick={() => chooseWord(word)}><span className="result-hanzi">{word.hanzi}</span><span className="result-pinyin">{word.pinyin || MISSING}</span><span className="result-meaning">{target === "vi" ? word.meaningVi || word.meaningEn || MISSING : word.meaningEn || word.meaningVi || MISSING}</span><small>{word.level >= 7 ? "HSK 7–9" : `HSK ${word.level}`}</small></button>) : <p className="empty-search">{busy ? "Đang tra…" : "Không tìm thấy mục từ phù hợp trong dữ liệu hiện có."}</p>}</div>}
          <div className="sentence-lookup"><div className="panel-heading"><div><span className="step-number">02</span><h2>Tách câu theo mục từ</h2></div><span className="small-note">Không sinh bản dịch câu</span></div>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Dán câu/đoạn tiếng Trung để tách và tra từng mục từ…" maxLength={4000} aria-label="Văn bản tiếng Trung cần tách từ" />
            <div className="controls-row"><button className="button primary" disabled={!input.trim() || busy} onClick={runAnalyze}>{busy ? "Đang tra từ điển…" : "Tách & tra từng từ"}</button></div>
          </div>
          {error && <p role="alert" className="error-message">{error}</p>}
        </section>

        {tokens.length > 0 && <section className="panel result-panel"><div className="panel-heading"><div><span className="step-number">03</span><h2>Từ vựng trong câu</h2></div><button className="text-button" onClick={() => {setTokens([]);setSentenceTranslation(null);}}>Ẩn kết quả</button></div>
          <div className="tokenized-text">{tokens.map((token, i) => token.isChinese ? <button key={`${token.surface}-${i}`} className={`token ${selected?.surface === token.surface ? "token-active" : ""} ${token.needsReview ? "token-review" : ""}`} onClick={() => openToken(token)} title={token.needsReview ? "Từ chưa có dữ liệu hoặc âm đọc cần kiểm tra" : "Mở chi tiết từ"}><span>{token.surface}</span><small>{token.pinyin || "?"}</small></button> : <span key={`${token.surface}-${i}`} className="punctuation">{token.surface}</span>)}</div>
          <div className="gloss-strip">{words.map((word, i) => <span key={`${word.surface}-${i}`}><b>{word.surface}</b> {word.word?.meaningVi || MISSING} · {word.word?.meaningEn || MISSING}</span>)}</div>
          <div className="sentence-translation"><div><b>Bản dịch câu tra từ dữ liệu offline</b><small>{sentenceTranslation?.available ? "Khớp ví dụ từ điển đã lưu" : "Không có câu khớp trong kho câu cục bộ; hệ thống không tự suy đoán."}</small></div>{sentenceTranslation?.available ? <><p><strong>Tiếng Việt:</strong> {sentenceTranslation.meaningVi || MISSING}</p><p><strong>English:</strong> {sentenceTranslation.meaningEn || MISSING}</p></> : <p>{MISSING} cho bản dịch nguyên câu.</p>}</div>
        </section>}
        <section className="tip-card"><span className="tip-icon">✳</span><div><b>Tra cứu bằng mục từ có nguồn</b><p>Mục từ không có trong nguồn sẽ được báo thiếu thay vì tự tạo nghĩa. Bấm vào từ để xem song ngữ và lưu ôn tập.</p></div></section>
      </div>
      <aside className="side-column"><div className="side-heading"><div><p className="eyebrow">TỪ VỰNG TRONG NGỮ CẢNH</p><h2>Chi tiết từ</h2></div><span className="side-count">{words.length.toString().padStart(2, "0")}</span></div>
        {selected ? <WordDetail token={selected} target={target} saved={!!selected.word && savedIds.includes(selected.word.id)} onSave={async()=>{if(selected.word)await toggleSave(selected.word);}} onClose={() => setSelected(null)} /> : <div className="empty-detail"><span className="empty-glyph">字</span><p>Chọn một mục từ<br/>để xem chi tiết.</p><small>Thông tin thiếu sẽ được đánh dấu rõ.</small></div>}
        <div className="side-divider"/><p className="side-footnote">Tra cứu dựa trên bản từ điển tĩnh đã cài kèm. Âm đọc đa nghĩa có thể cần đối chiếu ngữ cảnh.</p>
      </aside>
    </section> : tab === "write" ? <Writer /> : tab === "review" ? <section className="review-page"><div className="writer-intro"><p className="eyebrow">ÔN TẬP THEO NHỊP CỦA BẠN</p><h1>Nhớ lâu,<br/><em>không cần vội.</em></h1><p>Đã nhớ: ôn lại sau 24 giờ. Chưa nhớ: thẻ quay lại sau 5 phút. Tiến độ đồng bộ trong tài khoản.</p></div><p className="review-status">{reviewNotice || `Có ${dueCards.length} thẻ đến hạn · ${savedIds.length} từ trong thư viện`}</p>{dueCards[0] ? <Flashcard word={dueCards[0]} flipped={flipped} setFlipped={setFlipped} onAnswer={answerCard}/> : <div className="panel review-empty">{savedIds.length ? "Chưa có thẻ đến hạn. Bạn có thể quay lại sau." : "Thư viện đang trống. Hãy lưu từ trong Từ điển trước."}</div>}</section> : tab === "feedback" ? <FeedbackForm /> : tab === "admin" ? <AdminDashboard /> : tab === "groups" ? <StudyCommunityDashboard getIdToken={()=>user!.getIdToken()} /> : tab === "library" ? <LibraryDashboard /> : <section className="review-page"><div className="writer-intro"><p className="eyebrow">TIẾN ĐỘ CỦA BẠN</p><h1>Học đều,<br/><em>tiến bộ từng ngày.</em></h1></div><AchievementsDashboard getIdToken={()=>user!.getIdToken()}/><p className="community-privacy">Chỉ tính các lượt ôn đã xác nhận. Bạn có thể nghỉ bất cứ lúc nào; tiến độ không bị xóa hay phạt.</p></section>}
    <footer className="footer"><span>HocTiengTrungCungKhai · Học có chủ đích</span><span>Từ điển tĩnh cục bộ · Không dùng AI dịch</span></footer>
    <SocialHub pageOpen={tab==="social"&&Boolean(profile)} isAdmin={profile?.role==="admin"} onNeedAuth={()=>{if(profile)navigate("social");else setShowAuth(true);}}/>
    {showAuth&&<AuthDialog onClose={()=>setShowAuth(false)}/>}
  </main>;
}

function WordDetail({ token, target, saved, onSave, onClose }: { token: AnalyzedToken; target: "vi" | "en"; saved: boolean; onSave: () => Promise<void>; onClose: () => void }) {
  const [notice, setNotice] = useState("");
  const word = token.word;
  async function save() { if (!word) return; try{await onSave();setNotice(saved ? "Đã bỏ khỏi thư viện." : "Đã lưu vào thư viện tài khoản.");}catch(error){setNotice(error instanceof Error&&error.message==="AUTH_REQUIRED"?"Hãy đăng nhập để lưu từ.":"Không lưu được từ. Hãy thử lại.");} }
  function speak() { if (!("speechSynthesis" in window)) { setNotice("Trình duyệt này chưa hỗ trợ đọc tiếng Trung."); return; } const utterance = new SpeechSynthesisUtterance(token.surface); utterance.lang = "zh-CN"; speechSynthesis.speak(utterance); }
  return <article className="word-card"><button className="close-detail" onClick={onClose} aria-label="Đóng chi tiết">×</button><div className="word-level">{word ? (word.level >= 7 ? "HSK 7–9" : `HSK ${word.level}`) : "CHƯA CÓ MỤC TỪ"}{token.needsReview && <span className="review-badge">Cần kiểm tra</span>}</div><div className="word-hanzi">{token.surface}</div><div className="word-pinyin">{word?.pinyin || token.pinyin || MISSING}</div>
    <div className="detail-rows"><DetailRow label="Nghĩa tiếng Việt" value={word?.meaningVi || MISSING} /><DetailRow label="English meaning" value={word?.meaningEn || MISSING} /><DetailRow label="Âm Hán-Việt" value={word?.hanViet || MISSING} /><DetailRow label="Từ loại" value={word?.partOfSpeech || MISSING} /><DetailRow label="Ví dụ" value={word?.exampleChinese || MISSING} /><DetailRow label={`Nghĩa ví dụ (${target === "vi" ? "Việt" : "English"})`} value={target === "vi" ? word?.exampleVietnamese || word?.exampleEnglish || MISSING : word?.exampleEnglish || word?.exampleVietnamese || MISSING} /></div>
    {word?.sourceAttribution && <small className="attribution">Nguồn: {word.sourceAttribution}</small>}
    <div className="word-actions"><button className="button primary" onClick={save} disabled={!word}>{saved ? "✓ Bỏ lưu" : "＋ Lưu để ôn"}</button><button className="icon-button" title="Nghe phát âm" onClick={speak}>🔊</button></div>{notice && <small className="notice">{notice}</small>}
  </article>;
}
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><b>{value || MISSING}</b></div>; }

function Flashcard({ word, flipped, setFlipped, onAnswer }: { word: WordRecord; flipped: boolean; setFlipped: (value: boolean) => void; onAnswer: (remembered: boolean) => void }) {
  const pointer = useRef<number | null>(null); const startX = useRef(0); const swiped = useRef(false);
  function speak() { const utterance = new SpeechSynthesisUtterance(word.hanzi); utterance.lang = "zh-CN"; speechSynthesis.speak(utterance); }
  return <section className="flashcard-area"><div className="flashcard" onPointerDown={event => { pointer.current = event.pointerId; startX.current = event.clientX; }} onPointerUp={event => { if (pointer.current !== event.pointerId) return; const distance = event.clientX - startX.current; pointer.current = null; swiped.current = Math.abs(distance) > 70; if (distance > 70) onAnswer(true); else if (distance < -70) onAnswer(false); }} onClick={() => { if (swiped.current) { swiped.current = false; return; } setFlipped(!flipped); }} role="button" tabIndex={0} aria-label="Lật thẻ ôn tập">
      <span className="flashcard-hint">{flipped ? "MẶT SAU · NHẤN ĐỂ LẬT" : "MẶT TRƯỚC · NHẤN ĐỂ LẬT"}</span>
      {!flipped ? <><strong className="flashcard-hanzi">{word.hanzi}</strong><button className="icon-button" onClick={event => { event.stopPropagation(); speak(); }} aria-label="Nghe phát âm">🔊</button></> : <div className="flashcard-back"><strong>{word.pinyin || MISSING}</strong><span>Âm Hán-Việt: {word.hanViet || MISSING}</span><span>Tiếng Việt: {word.meaningVi || MISSING}</span><span>English: {word.meaningEn || MISSING}</span><span>Ví dụ: {word.exampleChinese || MISSING}</span><span>{word.exampleVietnamese || word.exampleEnglish || ""}</span></div>}
      <small>HSK {word.level >= 7 ? "7–9 (gộp)" : word.level}</small>
    </div><div className="review-actions"><button className="button secondary" onClick={() => onAnswer(false)}>← Chưa nhớ <small>5 phút</small></button><button className="button primary" onClick={() => onAnswer(true)}>Đã nhớ → <small>24 giờ</small></button></div><small className="keyboard-hint">Vuốt thẻ · ← chưa nhớ · → đã nhớ · Space lật thẻ</small></section>;
}

function FeedbackForm() {
  const [category, setCategory] = useState<"vocabulary" | "feature" | "experience" | "other">("vocabulary");
  const [details, setDetails] = useState(""); const [screenshotBase64, setScreenshotBase64] = useState(""); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);
  async function attach(file?: File) {
    if (!file) { setScreenshotBase64(""); return; }
    if (!file.type.startsWith("image/")) { setStatus("Vui lòng chọn tệp ảnh."); return; }
    try { const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); const encoded = canvas.toDataURL("image/jpeg", 0.68); if (encoded.length > 650_000) throw new Error("Ảnh sau nén vẫn quá lớn; vui lòng chọn ảnh nhỏ hơn."); setScreenshotBase64(encoded); setStatus("Đã đính kèm ảnh đã nén."); } catch (error) { setStatus(error instanceof Error ? error.message : "Không đọc được ảnh."); }
  }
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setStatus(""); try { await sendFeedback({ category, details, screenshotBase64: screenshotBase64 || undefined }); setDetails(""); setScreenshotBase64(""); setStatus("Đã lưu góp ý vào cơ sở dữ liệu của ứng dụng."); } catch (error) { setStatus(error instanceof Error ? error.message : "Không gửi được góp ý."); } finally { setBusy(false); } }
  return <section className="feedback-page"><div className="writer-intro"><p className="eyebrow">CÙNG CẢI THIỆN HỌC TIẾNG TRUNG</p><h1>Góp ý,<br/><em>để app tốt hơn.</em></h1><p>Ảnh đính kèm được thu nhỏ và lưu cùng góp ý trong cơ sở dữ liệu.</p></div><form className="panel feedback-form" onSubmit={submit}><label>Phân loại<select value={category} onChange={event => setCategory(event.target.value as typeof category)}><option value="vocabulary">Báo lỗi dữ liệu từ vựng</option><option value="feature">Góp ý tính năng</option><option value="experience">Giao diện/Trải nghiệm</option><option value="other">Khác</option></select></label><label>Nội dung chi tiết<textarea required minLength={5} maxLength={3000} value={details} onChange={event => setDetails(event.target.value)} placeholder="Mô tả điều bạn gặp hoặc đề xuất…"/></label><label>Ảnh chụp màn hình (không bắt buộc)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void attach(event.target.files?.[0])}/></label>{screenshotBase64 && <img className="feedback-preview" src={screenshotBase64} alt="Ảnh góp ý đã nén"/>}<button className="button primary" disabled={busy || details.trim().length < 5}>{busy ? "Đang gửi…" : "Gửi góp ý"}</button>{status && <p role="status" className="notice">{status}</p>}</form></section>;
}

function Writer() {
  const [character, setCharacter] = useState("你"); const [mode, setMode] = useState<StrokeMode>("watch"); const [errorCount, setErrorCount] = useState(0); const [hint, setHint] = useState(""); const [unavailable, setUnavailable] = useState(false);
  const [level, setLevel] = useState<1 | 2>(1); const [characters, setCharacters] = useState<string[]>([]);
  const [mnemonic, setMnemonic] = useState("");
  const container = useRef<HTMLDivElement>(null); const writerRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null);
  useEffect(() => { getWritingCharacters(level).then(result => { setCharacters(result.characters); if (result.characters.length && !result.characters.includes(character)) setCharacter(result.characters[0]); }).catch(() => setCharacters([])); }, [level]);
  useEffect(() => {
    setErrorCount(0); setHint(""); setUnavailable(false); setMnemonic("");
    if (!container.current) return;
    container.current.replaceChildren();
    const writer = HanziWriter.create(container.current, character, { width: 300, height: 300, padding: 18, showOutline: true, showCharacter: mode === "watch", strokeColor: "#26796d", radicalColor: "#c9824d", outlineColor: "#dfe8e3", drawingColor: "#173e37", drawingWidth: 18, charDataLoader: async char => { try { const response = await fetch(`/data/strokes/${encodeURIComponent(char)}.json`); if (!response.ok) throw Error(); return await response.json(); } catch { setUnavailable(true); throw Error("Stroke data unavailable"); } } });
    writerRef.current = writer;
    if (mode === "watch") writer.animateCharacter();
    if (mode === "trace") writer.quiz({ onMistake: () => recordMistake(), onComplete: () => setHint("Tốt lắm, bạn đã hoàn thành chữ này.") });
    if (mode === "recall") writer.quiz({ showHintAfterMisses: 3, onMistake: () => recordMistake(), onComplete: () => setHint("Hoàn thành! Hãy thử nhớ lại chữ sau một lúc.") });
    return () => { writer.cancelQuiz(); writerRef.current = null; };
  }, [character, mode]);
  function recordMistake() { setErrorCount(previous=>{const next=previous+1;if(next>=3)setHint("Gợi ý: xem lại thứ tự nét mẫu rồi thử lại nhẹ nhàng.");return next;}); }
  const changeCharacter = (next: string) => { if ([...next].length === 1) setCharacter(next); };
  return <section className="writer-page"><div className="writer-intro"><p className="eyebrow">LÀM QUEN VỚI TỪNG NÉT</p><h1>Viết để <em>ghi nhớ.</em></h1><p>Quan sát thứ tự nét, viết theo dấu mờ, rồi tự thử lại.</p></div><div className="writer-layout"><section className="panel writer-card"><div className="writer-controls"><label>Chữ Hán<input value={character} maxLength={1} onChange={e => changeCharacter(e.target.value)} aria-label="Nhập một chữ Hán" /></label><div className="mode-tabs">{([["watch", "Xem mẫu"], ["trace", "Theo nét"], ["recall", "Tự viết"]] as [StrokeMode, string][]).map(([value, label]) => <button className={mode === value ? "selected" : ""} key={value} onClick={() => setMode(value)}>{label}</button>)}</div></div><div className="character-picker"><div className="picker-heading"><b>Chọn chữ từ HSK {level}</b><div><button className={level === 1 ? "selected" : ""} onClick={() => setLevel(1)}>HSK 1</button><button className={level === 2 ? "selected" : ""} onClick={() => setLevel(2)}>HSK 2</button></div></div><div className="character-grid">{characters.map(char => <button key={char} className={char === character ? "picked" : ""} onClick={() => setCharacter(char)}>{char}</button>)}</div></div><div className="hanzi-canvas-wrap"><div className="canvas-crosshair"/><div className="hanzi-canvas" ref={container}/></div>{unavailable && <p className="error-message">Chưa có dữ liệu thứ tự nét cho chữ này.</p>}{hint && <p className="writer-hint">✳ {hint}</p>}<div className="writer-bottom"><span>Số lần sai đã ghi trên thiết bị này: <b>{errorCount}</b></span><button className="button secondary" onClick={() => { setHint(""); setMode(nextStrokeMode(mode)); }}>Thử lại ↻</button></div><div className="character-notes"><div><span>Bộ thủ</span><b>{MISSING} trong bộ dữ liệu hiện tại</b></div><div><span>Nghĩa bộ thủ</span><b>{MISSING} trong bộ dữ liệu hiện tại</b></div><label><span>Mẹo gợi nhớ của bạn</span><textarea value={mnemonic} onChange={e => setMnemonic(e.target.value)} placeholder="Ghi cách liên tưởng riêng cho chữ này…" maxLength={300}/></label><small>Mẹo chỉ tồn tại trong phiên hiện tại cho đến khi tài khoản được kết nối đồng bộ.</small></div></section><aside className="panel writer-aside"><span className="step-number">✳</span><h2>Nhịp học nhẹ nhàng</h2><p>Luyện viết tập trung vào thứ tự nét. Bộ đếm lỗi chỉ tồn tại trong phiên này; khách không tạo dữ liệu học cục bộ.</p><div className="stroke-legend"><span><i className="legend-dot green"/>Nét đã viết đúng</span><span><i className="legend-dot orange"/>Nét trong phần được nhấn của chữ (nếu có)</span></div><small>Dữ liệu nét viết được tải cục bộ từ bộ dữ liệu Hanzi Writer. Nhận dạng chữ viết tay tự do chưa nằm trong giai đoạn này.</small></aside></div></section>;
}
