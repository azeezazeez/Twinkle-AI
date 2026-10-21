import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, FileText, LoaderCircle, Send, Trash2, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../lib/api';
import { toast } from '../lib/toast';

type Doc = { id: number; name: string; status: string; size: number; chunkCount: number; createdAt?: string };
type Source = { citation: string; documentId: number; documentName: string; chunk: number; excerpt: string };
type Answer = { answer: string; sources: Source[] };
const fmt = (n: number) => n < 1024 ? `${n} B` : n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024/1024).toFixed(1)} MB`;

export default function KnowledgeBase() {
  const navigate = useNavigate(); 
  const [docs,setDocs] = useState<Doc[]>([]); const [loading,setLoading] = useState(true);
  const [uploading,setUploading] = useState(false); const [question,setQuestion] = useState('');
  const [asking,setAsking] = useState(false); const [answer,setAnswer] = useState<Answer|null>(null); const [error,setError] = useState('');
  const load = useCallback(async () => { try { const data = await fetchWithAuth('/api/rag/documents'); setDocs(Array.isArray(data) ? data as Doc[] : []); } catch { setError('Could not load your library. Please sign in again or check the backend.'); } finally { setLoading(false); } },[]);
  useEffect(()=>{ void load(); },[load]);
  const upload = async (file?: File) => { if(!file)return; setError(''); setAnswer(null); if(file.size > 15 * 1024 * 1024) { setError('This file is larger than 15 MB. Choose a smaller document.'); return; } if(file.size === 0) { setError('This file is empty. Choose a document with content.'); return; } setUploading(true); try { const form=new FormData(); form.append('file',file); const uploaded = await fetchWithAuth('/api/rag/documents',{method:'POST',body:form}) as Partial<Doc>; await load(); if(uploaded.status && uploaded.status !== 'READY') { setError(`Upload finished with status ${uploaded.status}. Check the document status before asking questions.`); toast.info(`Upload finished with status ${uploaded.status}`); } else toast.success('Document uploaded'); } catch(e) { setError(e instanceof Error ? e.message : 'Upload failed.'); toast.error(e instanceof Error ? e.message : 'Upload failed.'); } finally { setUploading(false); } };
  const remove = async (id:number) => { try { await fetchWithAuth(`/api/rag/documents/${id}`,{method:'DELETE'}); setDocs(d=>d.filter(x=>x.id!==id)); setAnswer(null); toast.success('Document deleted'); } catch { setError('Could not delete that document.'); toast.error('Could not delete that document.'); } };
  const ask = async () => { if(!question.trim())return; setAsking(true); setError(''); try { const result=await fetchWithAuth('/api/rag/ask',{method:'POST',body:JSON.stringify({question:question.trim()})}); setAnswer(result as Answer); } catch(e) { setError(e instanceof Error ? e.message : 'Could not answer that question.'); toast.error(e instanceof Error ? e.message : 'Could not answer that question.'); } finally { setAsking(false); } };
  return <main className="min-h-screen bg-[#0b0d12] text-zinc-100 px-4 py-6 md:px-8">
    <div className="mx-auto max-w-5xl">
      <button onClick={()=>navigate('/')} className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"><ArrowLeft size={16}/> Back to chat</button>
      <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C6613F]/30 bg-[#C6613F]/10 px-3 py-1 text-xs text-[#C6613F]"><BookOpen size={14}/> TWINKLE · LIBRARY</div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Chat with your documents</h1><p className="mt-2 max-w-2xl text-zinc-400">Upload your own material and ask questions grounded in its contents. Your documents are private to your account.</p></header>
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Your documents</h2><span className="text-xs text-zinc-500">{docs.length} uploaded</span></div>
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#C6613F]/40 bg-[#C6613F]/[0.05] px-4 py-7 text-center transition hover:bg-[#C6613F]/[0.10] ${uploading?'pointer-events-none opacity-60':''}`}>
            {uploading?<LoaderCircle className="mb-3 animate-spin text-[#C6613F]" size={25}/>:<UploadCloud className="mb-3 text-[#C6613F]" size={25}/>}<span className="font-medium">{uploading?'Processing and indexing…':'Upload a document'}</span><span className="mt-1 text-xs text-zinc-500">PDF, DOCX, TXT and text-based files · 15 MB max</span><input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html,.csv,.ppt,.pptx,.odt" disabled={uploading} onChange={e=>{void upload(e.target.files?.[0]);e.currentTarget.value='';}}/>
          </label>
          <div className="mt-4 space-y-2">{loading?<p className="py-5 text-center text-sm text-zinc-500">Loading documents…</p>:docs.length===0?<div className="py-6 text-center text-sm text-zinc-500">Your library is empty. Upload a document to get started.</div>:docs.map(doc=><div key={doc.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3"><FileText className="shrink-0 text-[#C6613F]" size={20}/><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{doc.name}</div><div className="mt-1 text-xs text-zinc-500">{doc.status==='READY'?`${doc.chunkCount||0} chunks · ${fmt(doc.size||0)}`:doc.status}</div></div><button title="Delete document" onClick={()=>void remove(doc.id)} className="rounded-lg p-2 text-zinc-500 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={16}/></button></div>)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h2 className="mb-1 font-medium">Ask your library</h2><p className="mb-4 text-sm text-zinc-500">Answers use relevant passages from your indexed documents.</p>
          <textarea value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask();}}} placeholder="What are the main ideas in my notes?" rows={4} maxLength={4000} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm outline-none placeholder:text-zinc-600 focus:border-[#C6613F]/60"/>
          <div className="mt-3 flex items-center justify-between"><span className="text-xs text-zinc-600">Enter to ask · Shift+Enter for a new line</span><button disabled={asking||!question.trim()||docs.length===0} onClick={()=>void ask()} className="inline-flex items-center gap-2 rounded-xl bg-[#C6613F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#D97757] disabled:cursor-not-allowed disabled:opacity-40">{asking?<LoaderCircle className="animate-spin" size={16}/>:<Send size={15}/>} Ask</button></div>
          {answer&&<div className="mt-6 border-t border-white/10 pt-5"><h3 className="mb-3 text-sm font-semibold text-[#C6613F]">Twinkle's answer</h3><div className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">{answer.answer}</div>{answer.sources?.length>0&&<div className="mt-5"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Retrieved sources</h4><div className="space-y-2">{answer.sources.map((s,i)=><div key={`${s.documentId}-${s.chunk}-${i}`} className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><div className="text-xs font-medium text-[#C6613F]">{s.citation} {s.documentName} · chunk {s.chunk}</div><p className="mt-1 text-xs leading-5 text-zinc-400">{s.excerpt}</p></div>)}</div></div>}</div>}
        </div>
      </section>
      {error&&<div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"><span>{error}</span><button onClick={()=>setError('')} className="ml-auto text-red-300">×</button></div>}
      <p className="mt-6 text-xs leading-5 text-zinc-600">AI-generated answers can be incorrect. Check the cited source excerpts before relying on important information.</p>
    </div>
  </main>;
}
