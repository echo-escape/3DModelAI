"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Image as ImageIcon, Send, Download, Loader2, AlertCircle, History, Trash2, Printer, CheckCircle2, Plus, FileCode, HelpCircle } from "lucide-react";
import { downloadAsSTL, loadModelWithFormat } from "@/utils/three-utils";
import { translations, Language } from "@/utils/i18n";
import ThreeCanvas from "@/components/ThreeCanvas";
import * as THREE from "three";

if (typeof window !== "undefined") {
  import("@google/model-viewer");
}

type JobStatus = "WAIT" | "RUN" | "DONE" | "FAIL";

interface HistoryItem {
  jobId: string;
  prompt: string;
  timestamp: number;
  status: JobStatus;
  resultUrl?: string;
  generateType?: string;
  enablePBR?: boolean;
}

export default function Home() {
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  const [mode, setMode] = useState<"text" | "image">("text");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState(""); 
  
  const [generateType, setGenerateType] = useState<"Normal" | "LowPoly">("LowPoly");
  const [enablePBR, setEnablePBR] = useState(true);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultModelUrl, setResultModelUrl] = useState<string | null>(null);
  
  const [modelScene, setModelScene] = useState<THREE.Group | null>(null);
  const [realFormat, setRealFormat] = useState<string>("glb");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingSTL, setIsExportingSTL] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [lang, setLang] = useState<Language>("zh");
  const [showHistory, setShowHistory] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isViewingHistory, setIsViewingHistory] = useState(false);

  const t = translations[lang];

  const resetSession = () => {
    setPrompt("");
    setImageUrl("");
    setActiveJobId(null);
    setCurrentStatus(null);
    setError(null);
    setResultModelUrl(null);
    setModelScene(null);
    setIsViewingHistory(false);
  };

  useEffect(() => {
    const savedId = localStorage.getItem("TENCENT_SECRET_ID");
    const savedKey = localStorage.getItem("TENCENT_SECRET_KEY");
    if (savedId) setSecretId(savedId);
    if (savedKey) setSecretKey(savedKey);
    const savedHistory = JSON.parse(localStorage.getItem("3D_MODEL_HISTORY") || "[]");
    setHistory(savedHistory);
    if (!savedId || !savedKey) setShowSettings(true);
  }, []);

  const updateHistory = useCallback((newItem: Partial<HistoryItem>) => {
    setHistory(prev => {
      const existingIndex = prev.findIndex(item => item.jobId === newItem.jobId);
      let updated;
      if (existingIndex > -1) {
        updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...newItem };
      } else {
        updated = [{ ...newItem } as HistoryItem, ...prev].slice(0, 20);
      }
      localStorage.setItem("3D_MODEL_HISTORY", JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    const loadPreview = async () => {
      if (resultModelUrl) {
        setModelScene(null);
        setError(null);
        setIsPreviewLoading(true);
        try {
          const proxyUrl = `/api/proxy-model?url=${encodeURIComponent(resultModelUrl)}`;
          console.log("Loading preview from proxy:", proxyUrl);
          
          const { scene, format } = await loadModelWithFormat(proxyUrl);
          setRealFormat(format);
          setModelScene(scene);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Preview load failed:", msg);
          setError("Preview failed: " + msg);
        } finally {
          setIsPreviewLoading(false);
        }
      } else {
        setModelScene(null);
      }
    };
    loadPreview();
  }, [resultModelUrl]);

  const checkStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-secret-id": secretId, "x-secret-key": secretKey },
        body: JSON.stringify({ jobId: id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const newStatus = data.Status as JobStatus;
      setCurrentStatus(newStatus);
      if (newStatus === "DONE") {
        const files = (data.ResultFile3Ds || []) as { Type: string; Url: string }[];
        // 智能寻找主模型文件：严格优先 GLB > OBJ > STL
        const mainModel = files.find((f) => f.Type.toUpperCase() === "GLB")
                        || files.find((f) => f.Type.toUpperCase() === "OBJ")
                        || files.find((f) => f.Type.toUpperCase() === "STL")
                        || files.find((f) => f.Url.match(/\.glb$/i))
                        || files.find((f) => f.Url.match(/\.obj$/i))
                        || files.find((f) => f.Url.match(/\.stl$/i))
                        || files[0]; // 兜底

        const modelUrl = mainModel?.Url;
        setResultModelUrl(modelUrl);
        setActiveJobId(null);
        updateHistory({ jobId: id, status: "DONE", resultUrl: modelUrl });
      } else if (newStatus === "FAIL") {
        setError(data.ErrorMessage || "Generation Failed");
        setActiveJobId(null);
        updateHistory({ jobId: id, status: "FAIL" });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message);
      setActiveJobId(null);
    }
  }, [secretId, secretKey, updateHistory]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeJobId && !resultModelUrl) {
      interval = setInterval(() => checkStatus(activeJobId), 5000);
    }
    return () => clearInterval(interval);
  }, [activeJobId, resultModelUrl, checkStatus]);

  const handleSubmit = async () => {
    if (!secretId || !secretKey) return setShowSettings(true);
    setIsSubmitting(true);
    setError(null);
    setResultModelUrl(null);
    setCurrentStatus("WAIT");
    try {
      const body = { action: mode === "text" ? "text-to-3d" : "image-to-3d", prompt, imageUrl, generateType, enablePBR };
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-secret-id": secretId, "x-secret-key": secretKey },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setActiveJobId(data.JobId);
      updateHistory({ jobId: data.JobId, prompt: mode === "text" ? prompt : "Image Task", timestamp: Date.now(), status: "WAIT", generateType, enablePBR });
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message);
      setCurrentStatus(null);
    } finally { setIsSubmitting(false); }
  };

  const handleSTLDownload = async () => {
    if (!resultModelUrl) return;
    setIsExportingSTL(true);
    try {
      await downloadAsSTL(`/api/proxy-model?url=${encodeURIComponent(resultModelUrl)}`, `model_${Date.now()}`);
    } catch (err: unknown) { 
      const error = err as Error;
      alert("STL Error: " + error.message); 
    }
    finally { setIsExportingSTL(false); }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setError(null);
    setActiveJobId(item.jobId);
    setCurrentStatus(item.status);
    setResultModelUrl(item.resultUrl || null);
    setIsViewingHistory(true);
  };

  return (
    <div className="min-h-screen bg-[#fcfaff] text-slate-700 font-sans flex p-4 md:p-6 gap-6 relative overflow-x-hidden">
      {/* 渐变背景装饰 */}
      <div className="fixed inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FFB7B2] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#B2F2BB] blur-[120px] rounded-full"></div>
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-[#B2E2F2] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[20%] left-[10%] w-[30%] h-[30%] bg-[#D1B3FF] blur-[120px] rounded-full"></div>
      </div>

      {/* 侧边历史栏 (优化为悬浮卡片感) */}
      <aside className={`fixed md:relative inset-y-4 left-4 md:inset-0 z-40 w-72 bg-white/60 backdrop-blur-xl border border-white/80 p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 transform transition-all duration-500 ease-in-out ${showHistory ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-xl"><History className="w-5 h-5 text-purple-400" /></div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">{t.history}</h2>
          </div>
          <button onClick={() => { localStorage.removeItem("3D_MODEL_HISTORY"); setHistory([]); }} className="text-slate-300 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
        
        <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-180px)] pr-2 custom-scrollbar">
          {history.map((item) => (
            <div 
              key={item.jobId} 
              onClick={() => loadFromHistory(item)}
              className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${activeJobId === item.jobId ? "bg-white border-blue-200 shadow-md scale-102" : "bg-white/30 border-transparent hover:bg-white/50"}`}
            >
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                <span>{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <span className={item.status === "DONE" ? "text-teal-400" : "text-amber-400"}>{item.status}</span>
              </div>
              <p className="text-xs font-bold text-slate-600 truncate">{item.prompt}</p>
            </div>
          ))}
          {history.length === 0 && (
            <div className="text-center py-10 opacity-30">
              <History className="w-10 h-10 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest">{t.noTasks}</p>
            </div>
          )}
        </div>
      </aside>

      {/* 主面板 (占据剩余空间) */}
      <div className="flex-1 w-full relative z-10 flex flex-col">
        <header className="flex justify-between items-center mb-6 px-4">
          <div className="flex items-center gap-4 group cursor-pointer">
            <div className="relative w-12 h-12 flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-3">
              {/* 背景装饰光晕 */}
              <div className="absolute inset-0 bg-gradient-to-tr from-[#FFB7B2]/40 to-[#B2E2F2]/40 rounded-2xl blur-lg group-hover:blur-xl transition-all opacity-0 group-hover:opacity-100"></div>
              
              {/* 装饰性UI方块 (模仿吉祥物背景) */}
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#FFB7B2]/40 rounded-sm blur-[1px] animate-pulse"></div>
              <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[#B2E2F2]/40 rounded-full blur-[1px]"></div>

              {/* 吉祥物容器 */}
              <div className="relative w-full h-full bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl p-1 shadow-sm overflow-hidden flex items-center justify-center">
                <img 
                  src="/images/mascot.png" 
                  alt="Mascot" 
                  className="w-full h-full object-contain mix-blend-multiply" 
                />
              </div>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase italic flex items-baseline gap-0.5">
              <span className="drop-shadow-sm">3D</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFB7B2] to-[#FF8E86]">Model</span>
              <span className="font-light text-slate-300">AI</span>
            </h1>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/80 shadow-sm border border-white text-slate-500 hover:bg-white transition-all font-black text-[10px] uppercase tracking-widest"
            >
              {lang === "zh" ? "EN" : "中文"}
            </button>
            <button onClick={resetSession} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/80 shadow-sm border border-white text-slate-500 hover:bg-white transition-all group">
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{t.newSession}</span>
            </button>
            <button onClick={() => setShowHistory(!showHistory)} className="md:hidden p-3 rounded-2xl bg-white/80 shadow-sm border border-white text-slate-500 hover:bg-white transition-all"><History className="w-5 h-5" /></button>
            <button onClick={() => setShowSettings(true)} className="p-3 rounded-2xl bg-white/80 shadow-sm border border-white text-slate-500 hover:bg-white transition-all"><Settings className="w-5 h-5" /></button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
          {/* 左侧控制 */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white/60 backdrop-blur-md border border-white/80 rounded-[2.5rem] p-8 shadow-xl shadow-blue-50/50 h-fit">
              <div className="flex gap-2 mb-6 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-100">
                <button onClick={() => setMode("text")} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${mode === "text" ? "bg-white shadow-sm text-[#FFB7B2]" : "text-slate-400 hover:text-slate-600"}`}>{t.textMode}</button>
                <button onClick={() => setMode("image")} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${mode === "image" ? "bg-white shadow-sm text-[#FFB7B2]" : "text-slate-400 hover:text-slate-600"}`}>{t.imageMode}</button>
              </div>

              {mode === "text" ? (
                <textarea 
                  value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.promptPlaceholder}
                  className="w-full h-40 bg-white/40 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-4 focus:ring-pink-50 transition-all text-slate-600 placeholder:text-slate-300 resize-none text-sm font-medium"
                />
              ) : (
                <div className="relative group border-2 border-dashed border-slate-200 rounded-[2rem] h-40 flex flex-col items-center justify-center bg-white/20 hover:bg-white/40 transition-all overflow-hidden">
                  <input type="file" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setImageUrl(reader.result as string); reader.readAsDataURL(file); } }} accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-20" />
                  {imageUrl ? (
                    <div className="absolute inset-0 z-10 p-4">
                      <div className="relative w-full h-full rounded-[1.5rem] overflow-hidden group/preview flex items-center justify-center bg-slate-50/50">
                        <img src={imageUrl} alt="Preview" className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover/preview:scale-105" />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">{t.changeImage}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 bg-blue-50 rounded-xl mb-2"><ImageIcon className="w-6 h-6 text-blue-300" /></div>
                      <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">{t.selectImage}</p>
                    </>
                  )}
                </div>
              )}

              {/* Generation Options */}
              <div className="mt-6 space-y-3">
                {isViewingHistory && (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 animate-in fade-in zoom-in duration-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-[10px] font-bold text-amber-600 leading-relaxed">
                      {t.historyAlert}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-[#B2E2F2]/10 rounded-2xl border border-[#B2E2F2]/30 cursor-pointer transition-all hover:bg-[#B2E2F2]/20" onClick={() => !isViewingHistory && setGenerateType(generateType === "LowPoly" ? "Normal" : "LowPoly")}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm text-[#B2E2F2]"><Printer className="w-4 h-4" /></div>
                    <div>
                      <p className="text-xs font-black text-slate-700 uppercase leading-none mb-1">{t.topology}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{generateType === "LowPoly" ? t.lowPoly : t.normal}</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-all relative ${generateType === "LowPoly" ? "bg-[#B2E2F2]" : "bg-slate-200"}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${generateType === "LowPoly" ? "translate-x-4" : ""}`} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FFB7B2]/10 rounded-2xl border border-[#FFB7B2]/30 cursor-pointer transition-all hover:bg-[#FFB7B2]/20" onClick={() => !isViewingHistory && setEnablePBR(!enablePBR)}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm text-[#FFB7B2]"><ImageIcon className="w-4 h-4" /></div>
                    <div>
                      <p className="text-xs font-black text-slate-700 uppercase leading-none mb-1">{t.material}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{enablePBR ? t.pbrTextures : t.whiteModel}</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-all relative ${enablePBR ? "bg-[#FFB7B2]" : "bg-slate-200"}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${enablePBR ? "translate-x-4" : ""}`} />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSubmit} disabled={isSubmitting || !!activeJobId || isViewingHistory}
                className="w-full mt-6 bg-gradient-to-r from-[#FFB7B2] to-[#FFD1DC] hover:shadow-lg hover:shadow-pink-100 disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-300 py-4 rounded-2xl font-black text-white transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-sm tracking-widest"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : isViewingHistory ? <><History className="w-4 h-4" /> {t.historyMode}</> : <><Send className="w-4 h-4" /> {t.startBuild}</>}
              </button>
            </div>

            {/* Quick Guide */}
            <div className="bg-white/40 backdrop-blur-sm border border-white/60 rounded-[2rem] p-6 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                <FileCode className="w-3 h-3" /> {t.quickGuide}
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-600 mb-1">{t.guideKeys}</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {t.guideKeysDesc.split("Tencent Cloud Console")[0]}
                    <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" className="text-blue-400 hover:underline">Tencent Cloud Console</a>
                    {t.guideKeysDesc.split("Tencent Cloud Console")[1]}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-600 mb-1">{t.guideOptions}</p>
                  <ul className="text-[10px] text-slate-400 space-y-1">
                    <li>• <span className="font-bold">{t.topology}</span>: {t.guideOptionsDesc1}</li>
                    <li>• <span className="font-bold">{t.material}</span>: {t.guideOptionsDesc2}</li>
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-600 mb-1">{t.guideExport}</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {t.guideExportDesc}
                  </p>
                </div>
              </div>
            </div>

            {(currentStatus || error) && (
              <div className={`p-5 rounded-[2rem] border animate-in fade-in slide-in-from-bottom-2 flex items-center gap-4 ${error ? "bg-red-50 border-red-100 text-red-400" : "bg-teal-50 border-teal-100 text-teal-500"}`}>
                <div className="bg-white p-2 rounded-xl shadow-sm">
                  {error ? <AlertCircle className="w-5 h-5" /> : currentStatus === "DONE" ? <CheckCircle2 className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                </div>
                <div className="flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-0.5">{error ? t.error : t.status}</p>
                  <p className="text-xs font-black uppercase text-slate-700">{error || currentStatus}</p>
                </div>
              </div>
            )}
          </div>

          {/* 右侧预览 */}
          <div className="lg:col-span-7">
            <section className="bg-white/60 backdrop-blur-md border border-white/80 rounded-[3rem] p-4 flex flex-col h-full shadow-2xl relative overflow-hidden min-h-[500px]">
              <div className="flex-1 relative rounded-[2.5rem] overflow-hidden bg-gradient-to-b from-slate-50/50 to-white/20">
                
                <ThreeCanvas scene={modelScene} />

                {(activeJobId || isPreviewLoading) && !modelScene && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                    <Loader2 className="w-8 h-8 text-[#FFB7B2] animate-spin mb-4" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">
                      {isPreviewLoading ? t.loadingPreview : t.calculating}
                    </p>
                  </div>
                )}
              </div>

              {resultModelUrl && (
                <div className="p-4 mt-2 flex gap-3">
                  <a href={`/api/proxy-model?url=${encodeURIComponent(resultModelUrl)}`} download={`model.${realFormat}`} className="flex-1 bg-white hover:bg-slate-50 border border-slate-100 py-3.5 rounded-xl font-black text-[10px] text-slate-600 shadow-sm flex items-center justify-center gap-2 transition-all uppercase tracking-widest">
                    <Download className="w-4 h-4 text-blue-300" /> {realFormat}
                  </a>
                  <button onClick={handleSTLDownload} disabled={isExportingSTL} className="flex-1 bg-[#D1B3FF] hover:bg-[#C4A3FF] text-white py-3.5 rounded-xl font-black text-[10px] shadow-lg shadow-purple-100 flex items-center justify-center gap-2 transition-all uppercase tracking-widest">
                    {isExportingSTL ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4" /> Print (STL)</>}
                  </button>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {/* 设置对话框 */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
          <div className="bg-white/90 backdrop-blur-2xl w-full max-w-sm rounded-[3rem] p-10 border border-white shadow-2xl">
            <div className="flex justify-center mb-6">
              <div className="p-3 bg-pink-50 rounded-full"><Settings className="w-6 h-6 text-pink-300 animate-spin-slow" /></div>
            </div>
            <h2 className="text-xl font-black mb-6 text-center text-slate-800 uppercase tracking-tighter">{t.auth}</h2>
            <div className="space-y-4">
              <input type="password" value={secretId} onChange={(e) => setSecretId(e.target.value)} placeholder="Tencent SecretId" className="w-full bg-white/50 border border-slate-100 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-blue-50 transition-all text-xs font-bold" />
              <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Tencent SecretKey" className="w-full bg-white/50 border border-slate-100 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-blue-50 transition-all text-xs font-bold" />
              <button onClick={() => { localStorage.setItem("TENCENT_SECRET_ID", secretId); localStorage.setItem("TENCENT_SECRET_KEY", secretKey); setShowSettings(false); }} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl shadow-slate-200 transition-all text-xs tracking-widest uppercase">{t.connect}</button>
              <button onClick={() => setShowSettings(false)} className="w-full py-2 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] hover:text-slate-600 transition-colors">{t.close}</button>
            </div>
          </div>
        </div>
      )}


      <style jsx global>{`
        @keyframes float {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(2deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-slow { animation: bounce-slow 4s ease-in-out infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.03); border-radius: 10px; }
        .scale-102 { transform: scale(1.02); }
      `}</style>
    </div>
  );
}
