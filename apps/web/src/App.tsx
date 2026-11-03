import { useEffect, useMemo, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import { analyze, findWord, getWritingCharacters, reportError, saveWord, translate } from "./api";
import type { AiTokenGloss, AnalyzedToken, TranslationResult } from "./types";
import { nextStrokeMode, type StrokeMode } from "./stroke-practice";

type Tab = "translate" | "write";
const MISSING = "Chưa có dữ liệu";

export default function App() {
  const [tab, setTab] = useState<Tab>("translate");
  const [dark, setDark] = useState(() => localStorage.getItem("hanzi-dark") === "true");
  const [target, setTarget] = useState<"vi" | "en">("vi");
  const [input, setInput] = useState("");
  const [tokens, setTokens] = useState<AnalyzedToken[]>([]);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [selected, setSelected] = useState<AnalyzedToken | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("hanzi-dark", String(dark)); }, [dark]);
  const glosses = useMemo(() => new Map((translation?.tokens ?? []).map((item: AiTokenGloss) => [item.surface, item])), [translation]);

  async function runAnalyze() {
    setBusy(true); setError(""); setTranslation(null); setSelected(null);
    try { const result = await analyze(input); setTokens(result.tokens); }
    catch (e) { setError(e instanceof Error ? e.message : "Không thể phân tích văn bản."); }
    finally { setBusy(false); }
  }
  async function runTranslate() {
    if (!consent) return;
    setBusy(true); setError("");
    try {
      const result = await analyze(input); setTokens(result.tokens);
      setTranslation(await translate(input, target, result.tokens));
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể dịch văn bản."); }
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

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark">汉</span><span>HocTiengTrung<span className="brand-accent">CungKhai</span><small>HỌC CHỮ, HIỂU NGHĨA</small></span></a>
      <nav className="main-nav" aria-label="Chức năng"><button className={tab === "translate" ? "nav-item active" : "nav-item"} onClick={() => setTab("translate")}>Tra & dịch</button><button className={tab === "write" ? "nav-item active" : "nav-item"} onClick={() => setTab("write")}>Luyện viết</button></nav>
      <button className="theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? "Bật chế độ sáng" : "Bật chế độ tối"}>{dark ? "☀" : "◐"}<span>{dark ? "Sáng" : "Tối"}</span></button>
    </header>

    {tab === "translate" ? <section className="page-grid">
      <div className="primary-column">
        <div className="welcome"><div><p className="eyebrow">KHÔNG GIAN HỌC TẬP CỦA BẠN</p><h1>Đọc tiếng Trung,<br/><em>từng từ một.</em></h1><p className="subhead">Tra từ trong ngữ cảnh, hiểu cấu trúc câu và lưu lại điều bạn muốn nhớ.</p></div><div className="hero-seal">学<span>习</span></div></div>
        <section className="panel input-panel">
          <div className="panel-heading"><div><span className="step-number">01</span><h2>Văn bản tiếng Trung</h2></div><span className="small-note">Giản thể hoặc phồn thể</span></div>
          <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Dán một câu hoặc đoạn văn tiếng Trung…" maxLength={4000} aria-label="Văn bản tiếng Trung" />
          <div className="input-footer"><span>{input.length}/4000 ký tự</span><button className="text-button" onClick={() => { setInput(""); setTokens([]); setTranslation(null); }}>Xóa nội dung</button></div>
          <div className="controls-row"><div className="language-pills" aria-label="Chọn ngôn ngữ đích"><span>Dịch sang</span><button className={target === "vi" ? "selected" : ""} onClick={() => setTarget("vi")}>Tiếng Việt</button><button className={target === "en" ? "selected" : ""} onClick={() => setTarget("en")}>English</button></div><button className="button secondary" disabled={!input.trim() || busy} onClick={runAnalyze}>Tách từ</button><button className="button primary" disabled={!input.trim() || busy || !consent} onClick={runTranslate}>{busy ? "Đang xử lý…" : "Dịch câu ↗"}</button></div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Tôi đồng ý gửi văn bản này đến API AI đã cấu hình để dịch. Nội dung không được lưu trong ứng dụng.</span></label>
          {error && <p role="alert" className="error-message">{error}</p>}
        </section>

        {(tokens.length > 0 || translation) && <section className="panel result-panel"><div className="panel-heading"><div><span className="step-number">02</span><h2>Kết quả phân tích</h2></div><button className="text-button" onClick={() => setTokens([])}>Ẩn kết quả</button></div>
          {translation && <div className="translation-box"><div className="result-label">BẢN DỊCH {target === "vi" ? "TIẾNG VIỆT" : "ENGLISH"}</div><p>{translation.translation}</p><small>ⓘ Bản dịch máy, có thể sai.</small></div>}
          <div className="tokenized-text">{tokens.map((token, i) => token.isChinese ? <button key={`${token.surface}-${i}`} className={`token ${selected?.surface === token.surface ? "token-active" : ""} ${token.needsReview ? "token-review" : ""}`} onClick={() => openToken(token)} title={token.needsReview ? "Từ chưa có dữ liệu hoặc âm đọc cần kiểm tra" : "Mở chi tiết từ"}><span>{token.surface}</span><small>{token.pinyin || "?"}</small></button> : <span key={`${token.surface}-${i}`} className="punctuation">{token.surface}</span>)}</div>
          {translation && <div className="gloss-strip">{words.map((word, i) => <span key={`${word.surface}-${i}`}><b>{word.surface}</b> {glosses.get(word.surface)?.[target === "vi" ? "meaningVi" : "meaningEn"] || word.word?.[target === "vi" ? "meaningVi" : "meaningEn"] || MISSING}</span>)}</div>}
          {translation && <p className="privacy-note">Văn bản được gửi tới nhà cung cấp API đã cấu hình để dịch và không được ghi vào cơ sở dữ liệu ứng dụng.</p>}
        </section>}
        <section className="tip-card"><span className="tip-icon">✳</span><div><b>Học theo nhịp của bạn</b><p>Bấm vào từ để xem thông tin, nghe phát âm hoặc lưu vào sổ từ cá nhân.</p></div></section>
      </div>
      <aside className="side-column"><div className="side-heading"><div><p className="eyebrow">TỪ VỰNG TRONG NGỮ CẢNH</p><h2>Chi tiết từ</h2></div><span className="side-count">{words.length.toString().padStart(2, "0")}</span></div>
        {selected ? <WordDetail token={selected} gloss={glosses.get(selected.surface)} target={target} onClose={() => setSelected(null)} /> : <div className="empty-detail"><span className="empty-glyph">字</span><p>Chọn một từ trong kết quả<br/>để xem chi tiết.</p><small>Thông tin thiếu sẽ được đánh dấu rõ.</small></div>}
        <div className="side-divider"/><p className="side-footnote">Pinyin được suy ra tự động khi chưa có mục từ khớp. Âm đọc đa nghĩa cần được kiểm tra theo ngữ cảnh.</p>
      </aside>
    </section> : <Writer />}
    <footer className="footer"><span>HocTiengTrungCungKhai · Học có chủ đích</span><span>Dữ liệu từ vựng HSK 3.0 · Dùng tại máy của bạn</span></footer>
  </main>;
}

function WordDetail({ token, gloss, target, onClose }: { token: AnalyzedToken; gloss?: AiTokenGloss; target: "vi" | "en"; onClose: () => void }) {
  const [saved, setSaved] = useState(false); const [report, setReport] = useState(false); const [notice, setNotice] = useState("");
  const word = token.word;
  const meaningVi = gloss?.meaningVi || word?.meaningVi || MISSING;
  const meaningEn = gloss?.meaningEn || word?.meaningEn || MISSING;
  async function save() { if (!word) return; try { await saveWord(word.id); setSaved(true); setNotice("Đã lưu vào sổ từ."); } catch { setNotice("Chưa lưu được từ này."); } }
  function speak() { if (!("speechSynthesis" in window)) { setNotice("Trình duyệt này chưa hỗ trợ đọc tiếng Trung."); return; } const utterance = new SpeechSynthesisUtterance(token.surface); utterance.lang = "zh-CN"; speechSynthesis.speak(utterance); }
  async function sendReport() { try { await reportError({ wordId: word?.id, surface: token.surface, field: gloss ? "ai-translation" : "dictionary", note: "Người dùng báo lỗi từ chi tiết." }); setReport(false); setNotice("Đã ghi nhận báo lỗi."); } catch { setNotice("Không gửi được báo lỗi."); } }
  return <article className="word-card"><button className="close-detail" onClick={onClose} aria-label="Đóng chi tiết">×</button><div className="word-level">{word ? (word.level >= 7 ? "HSK 7–9" : `HSK ${word.level}`) : "CHƯA CÓ MỤC TỪ"}{token.needsReview && <span className="review-badge">Cần kiểm tra</span>}</div><div className="word-hanzi">{token.surface}</div><div className="word-pinyin">{word?.pinyin || token.pinyin || MISSING}</div>
    <div className="detail-rows"><DetailRow label="Nghĩa tiếng Việt" value={meaningVi} /><DetailRow label="English meaning" value={meaningEn} /><DetailRow label="Âm Hán-Việt" value={word?.hanViet || MISSING} /><DetailRow label="Từ loại" value={word?.partOfSpeech || MISSING} /><DetailRow label="Ví dụ" value={word?.exampleChinese || MISSING} /><DetailRow label="Nghĩa ví dụ" value={target === "vi" ? word?.exampleVietnamese || MISSING : word?.exampleEnglish || MISSING} /></div>
    {(gloss?.meaningVi || gloss?.meaningEn) && <p className="ai-label">Nghĩa theo ngữ cảnh do AI gợi ý.</p>}
    {word?.sourceAttribution && <small className="attribution">Nguồn: {word.sourceAttribution}</small>}
    <div className="word-actions"><button className="button primary" onClick={save} disabled={!word || saved}>{saved ? "✓ Đã lưu" : "＋ Lưu từ"}</button><button className="icon-button" title="Nghe phát âm" onClick={speak}>🔊</button><button className="text-button report-button" onClick={() => setReport(!report)}>Báo lỗi</button></div>
    {report && <div className="report-box"><p>Nội dung này có vẻ chưa chính xác?</p><button className="button secondary" onClick={sendReport}>Gửi báo lỗi</button></div>}{notice && <small className="notice">{notice}</small>}
  </article>;
}
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><b>{value || MISSING}</b></div>; }

function Writer() {
  const [character, setCharacter] = useState("你"); const [mode, setMode] = useState<StrokeMode>("watch"); const [errorCount, setErrorCount] = useState(0); const [hint, setHint] = useState(""); const [unavailable, setUnavailable] = useState(false);
  const [level, setLevel] = useState<1 | 2>(1); const [characters, setCharacters] = useState<string[]>([]);
  const [mnemonic, setMnemonic] = useState("");
  const container = useRef<HTMLDivElement>(null); const writerRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null);
  useEffect(() => { getWritingCharacters(level).then(result => { setCharacters(result.characters); if (result.characters.length && !result.characters.includes(character)) setCharacter(result.characters[0]); }).catch(() => setCharacters([])); }, [level]);
  useEffect(() => {
    const stored = Number(localStorage.getItem(`stroke-errors-${character}`) || 0); setErrorCount(stored); setHint(""); setUnavailable(false);
    setMnemonic(localStorage.getItem(`mnemonic-${character}`) || "");
    if (!container.current) return;
    container.current.replaceChildren();
    const writer = HanziWriter.create(container.current, character, { width: 300, height: 300, padding: 18, showOutline: true, showCharacter: mode === "watch", strokeColor: "#26796d", radicalColor: "#c9824d", outlineColor: "#dfe8e3", drawingColor: "#173e37", drawingWidth: 18, charDataLoader: async char => { try { const response = await fetch(`/data/strokes/${encodeURIComponent(char)}.json`); if (!response.ok) throw Error(); return await response.json(); } catch { setUnavailable(true); throw Error("Stroke data unavailable"); } } });
    writerRef.current = writer;
    if (mode === "watch") writer.animateCharacter();
    if (mode === "trace") writer.quiz({ onMistake: () => recordMistake(), onComplete: () => setHint("Tốt lắm, bạn đã hoàn thành chữ này.") });
    if (mode === "recall") writer.quiz({ showHintAfterMisses: 3, onMistake: () => recordMistake(), onComplete: () => setHint("Hoàn thành! Hãy thử nhớ lại chữ sau một lúc.") });
    return () => { writer.cancelQuiz(); writerRef.current = null; };
  }, [character, mode]);
  function recordMistake() { const next = Number(localStorage.getItem(`stroke-errors-${character}`) || 0) + 1; localStorage.setItem(`stroke-errors-${character}`, String(next)); setErrorCount(next); if (next >= 3) setHint("Gợi ý: xem lại thứ tự nét mẫu rồi thử lại nhẹ nhàng."); }
  const changeCharacter = (next: string) => { if ([...next].length === 1) setCharacter(next); };
  return <section className="writer-page"><div className="writer-intro"><p className="eyebrow">LÀM QUEN VỚI TỪNG NÉT</p><h1>Viết để <em>ghi nhớ.</em></h1><p>Quan sát thứ tự nét, viết theo dấu mờ, rồi tự thử lại.</p></div><div className="writer-layout"><section className="panel writer-card"><div className="writer-controls"><label>Chữ Hán<input value={character} maxLength={1} onChange={e => changeCharacter(e.target.value)} aria-label="Nhập một chữ Hán" /></label><div className="mode-tabs">{([["watch", "Xem mẫu"], ["trace", "Theo nét"], ["recall", "Tự viết"]] as [StrokeMode, string][]).map(([value, label]) => <button className={mode === value ? "selected" : ""} key={value} onClick={() => setMode(value)}>{label}</button>)}</div></div><div className="character-picker"><div className="picker-heading"><b>Chọn chữ từ HSK {level}</b><div><button className={level === 1 ? "selected" : ""} onClick={() => setLevel(1)}>HSK 1</button><button className={level === 2 ? "selected" : ""} onClick={() => setLevel(2)}>HSK 2</button></div></div><div className="character-grid">{characters.map(char => <button key={char} className={char === character ? "picked" : ""} onClick={() => setCharacter(char)}>{char}</button>)}</div></div><div className="hanzi-canvas-wrap"><div className="canvas-crosshair"/><div className="hanzi-canvas" ref={container}/></div>{unavailable && <p className="error-message">Chưa có dữ liệu thứ tự nét cho chữ này.</p>}{hint && <p className="writer-hint">✳ {hint}</p>}<div className="writer-bottom"><span>Số lần sai đã ghi trên thiết bị này: <b>{errorCount}</b></span><button className="button secondary" onClick={() => { setHint(""); setMode(nextStrokeMode(mode)); }}>Thử lại ↻</button></div><div className="character-notes"><div><span>Bộ thủ</span><b>{MISSING} trong bộ dữ liệu hiện tại</b></div><div><span>Nghĩa bộ thủ</span><b>{MISSING} trong bộ dữ liệu hiện tại</b></div><label><span>Mẹo gợi nhớ của bạn</span><textarea value={mnemonic} onChange={e => { setMnemonic(e.target.value); localStorage.setItem(`mnemonic-${character}`, e.target.value); }} placeholder="Ghi cách liên tưởng riêng cho chữ này…" maxLength={300}/></label><small>Mẹo được lưu trên thiết bị này. App không tự tạo nghĩa bộ thủ khi chưa có nguồn đáng tin cậy.</small></div></section><aside className="panel writer-aside"><span className="step-number">✳</span><h2>Nhịp học nhẹ nhàng</h2><p>Luyện viết tập trung vào thứ tự nét. Bộ đếm lỗi được lưu trên thiết bị để bạn quay lại ôn tập.</p><div className="stroke-legend"><span><i className="legend-dot green"/>Nét đã viết đúng</span><span><i className="legend-dot orange"/>Nét trong phần được nhấn của chữ (nếu có)</span></div><small>Dữ liệu nét viết được tải cục bộ từ bộ dữ liệu Hanzi Writer. Nhận dạng chữ viết tay tự do chưa nằm trong giai đoạn này.</small></aside></div></section>;
}
