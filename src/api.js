export const rankScore=t=>(t.rating?parseFloat(t.rating):0)*2+Math.log10((t.usage||t.usage_count||0)+1);

// ── API ───────────────────────────────────────────────────────────────────────
export const MODELS=[
  {id:"claude-sonnet-4-20250514",  label:"Sonnet 4",         provider:"anthropic"},
  {id:"claude-opus-4-20250514",    label:"Opus 4",           provider:"anthropic"},
  {id:"claude-haiku-4-5-20251001", label:"Haiku 4.5",        provider:"anthropic"},
  {id:"claude-sonnet-3-7-20250219",label:"Sonnet 3.7",       provider:"anthropic"},
  {id:"gemini-2.5-pro",            label:"Gemini 2.5 Pro",   provider:"gemini"},
  {id:"gemini-2.5-flash",          label:"Gemini 2.5 Flash", provider:"gemini"},
  {id:"gemini-2.0-flash",          label:"Gemini 2.0 Flash", provider:"gemini"},
];
export const isGemini=id=>id?.startsWith("gemini");
export async function streamGemini({messages,system,onToken,onDone,onErr,_geminiKey="",_maxTok=1000,_model="gemini-2.5-flash"}) {
  if(!_geminiKey){onErr("Gemini API key not set — add it in ⚙ Settings.");return;}
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${_model}:streamGenerateContent?alt=sse&key=${_geminiKey}`;
  const body={contents:messages.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:_maxTok},...(system?{systemInstruction:{parts:[{text:system}]}}:{})};
  try {
    const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!res.ok){const d=await res.json().catch(()=>({}));onErr(`HTTP ${res.status}: ${d.error?.message||"Gemini error"}`);return;}
    const reader=res.body.getReader(),dec=new TextDecoder();let buf="";
    while(true){
      const {done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split("\n");buf=lines.pop();
      for(const l of lines){
        if(!l.startsWith("data:"))continue;
        const raw=l.slice(5).trim();if(raw==="[DONE]")continue;
        try{const ev=JSON.parse(raw);const t=ev.candidates?.[0]?.content?.parts?.[0]?.text;if(t)onToken(t);}catch{ /* ignore parse errors */ }
      }
    }
    onDone();
  }catch(e){onErr(e.message);}
}
export async function callGemini({messages,system,_geminiKey="",_maxTok=1000,_model="gemini-2.5-flash"}) {
  if(!_geminiKey)throw new Error("Gemini API key not set — add it in ⚙ Settings.");
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${_model}:generateContent?key=${_geminiKey}`;
  const body={contents:messages.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:_maxTok},...(system?{systemInstruction:{parts:[{text:system}]}}:{})};
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await res.json();
  if(!res.ok)throw new Error(d.error?.message||`HTTP ${res.status}`);
  return d.candidates?.[0]?.content?.parts?.[0]?.text||"";
}
export async function streamClaude({messages,system,onToken,onDone,onErr,_key="",_proxy="",_jwt="",_maxTok=1000,_model="",_geminiKey=""}) {
  if(isGemini(_model))return streamGemini({messages,system,onToken,onDone,onErr,_geminiKey,_maxTok,_model});
  const up=!!_proxy;
  const url=up?_proxy:"https://api.anthropic.com/v1/messages";
  const hdr=up?{"Content-Type":"application/json","Authorization":`Bearer ${_jwt||_key}`}:{"Content-Type":"application/json","x-api-key":_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"};
  try {
    const res=await fetch(url,{method:"POST",headers:hdr,body:JSON.stringify({model:_model||"claude-sonnet-4-20250514",max_tokens:_maxTok,stream:true,system,messages})});
    if (!res.ok) {
      const ct=res.headers.get("content-type")||"";
      const body=ct.includes("json")?(await res.json()).error?.message:await res.text();
      onErr(`HTTP ${res.status}: ${String(body).slice(0,160)}`); return;
    }
    const reader=res.body.getReader(),dec=new TextDecoder();let buf="";
    while(true) {
      const {done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split("\n");buf=lines.pop();
      for(const l of lines) {
        if(!l.startsWith("data:"))continue;
        const raw=l.slice(5).trim();if(raw==="[DONE]")continue;
        try{const ev=JSON.parse(raw);if(ev.type==="content_block_delta"&&ev.delta?.type==="text_delta")onToken(ev.delta.text);}catch{ /* ignore parse errors */ }
      }
    }
    onDone();
  } catch(e){onErr(e.message);}
}
export async function callClaude({messages,system,_key="",_proxy="",_jwt="",_model="",_geminiKey=""}) {
  if(isGemini(_model))return callGemini({messages,system,_geminiKey,_model});
  const up=!!_proxy;
  const url=up?_proxy:"https://api.anthropic.com/v1/messages";
  const hdr=up?{"Content-Type":"application/json","Authorization":`Bearer ${_jwt||_key}`}:{"Content-Type":"application/json","x-api-key":_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"};
  const res=await fetch(url,{method:"POST",headers:hdr,body:JSON.stringify({model:_model||"claude-sonnet-4-20250514",max_tokens:1000,system,messages})});
  const ct=res.headers.get("content-type")||"";
  if(!ct.includes("json")){const t=await res.text();throw new Error(`HTTP ${res.status}: ${t.slice(0,120)}`);}
  const d=await res.json();
  if(!res.ok)throw new Error(d.error?.message||`HTTP ${res.status}`);
  return d.content?.[0]?.text||"";
}
export async function compressCtx(ctx,goal,_key,_proxy,_jwt,_model,_geminiKey) {
  if(!ctx.length)return"";
  try {
    const s=await callClaude({system:"Summarize agent outputs into 3-5 compact sentences preserving ALL technical decisions, code, and key facts. No fluff.",messages:[{role:"user",content:`GOAL: ${goal}\n\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,600)}`).join("\n\n")}`}],_key,_proxy,_jwt,_model,_geminiKey});
    return`\n\nPRIOR CONTEXT (compressed):\n${s}`;
  } catch{return`\n\nPRIOR CONTEXT:\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,300)}`).join("\n\n")}`;}
}

// ── SUPABASE ──────────────────────────────────────────────────────────────────
export function mkDb(url,key) {
  const base=url.replace(/\/$/,"");
  const h={"Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${key}`};
  return {
    async ins(t,row){const r=await fetch(`${base}/rest/v1/${t}`,{method:"POST",headers:{...h,"Prefer":"return=representation"},body:JSON.stringify(row)});if(!r.ok)throw new Error((await r.json()).message);return r.json();},
    async sel(t,q=""){const r=await fetch(`${base}/rest/v1/${t}?${q}`,{headers:h});if(!r.ok)throw new Error((await r.json()).message);return r.json();},
    async del(t,id){await fetch(`${base}/rest/v1/${t}?id=eq.${id}`,{method:"DELETE",headers:h});},
  };
}
export function mkAuth(url,key) {
  const base=url.replace(/\/$/,"");const h={"Content-Type":"application/json","apikey":key};
  return {
    async signIn(e,p){const r=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:"POST",headers:h,body:JSON.stringify({email:e,password:p})});const d=await r.json();if(!r.ok)throw new Error(d.error_description||"Failed");return d;},
    async signUp(e,p){const r=await fetch(`${base}/auth/v1/signup`,{method:"POST",headers:h,body:JSON.stringify({email:e,password:p})});const d=await r.json();if(!r.ok)throw new Error(d.error_description||"Failed");return d;},
  };
}
