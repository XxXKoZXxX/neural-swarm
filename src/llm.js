// Provider-agnostic LLM helpers shared by every call site in the app.
export const MODELS=[
  {id:"claude-sonnet-4-20250514",  label:"Sonnet 4",         provider:"anthropic"},
  {id:"claude-opus-4-20250514",    label:"Opus 4",           provider:"anthropic"},
  {id:"claude-haiku-4-5-20251001", label:"Haiku 4.5",        provider:"anthropic"},
  {id:"claude-sonnet-3-7-20250219",label:"Sonnet 3.7",       provider:"anthropic"},
  {id:"gemini-2.5-pro",            label:"Gemini 2.5 Pro",   provider:"gemini"},
  {id:"gemini-2.5-flash",          label:"Gemini 2.5 Flash", provider:"gemini"},
  {id:"gemini-2.0-flash",          label:"Gemini 2.0 Flash", provider:"gemini"},
];
const DEFAULT_CLAUDE="claude-sonnet-4-20250514";
const DEFAULT_GEMINI="gemini-2.5-flash";
const DEFAULT_MAX_TOK=1000;

export const isGemini=id=>id?.startsWith("gemini");

export async function httpErrorMessage(res,fallback="Request failed") {
  const ct=res.headers.get("content-type")||"";
  let detail;
  try{detail=ct.includes("json")?(await res.json()).error?.message:await res.text();}catch{ /* body already consumed or unreadable */ }
  return `HTTP ${res.status}: ${String(detail||fallback).slice(0,160)}`;
}

async function readJson(res,sliceLen=160) {
  const ct=res.headers.get("content-type")||"";
  if(!ct.includes("json"))throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0,sliceLen)}`);
  return res.json();
}

// Consumes an SSE body, handing each parsed `data:` payload to onEvent.
async function readSSE(res,onEvent) {
  const reader=res.body.getReader(),dec=new TextDecoder();let buf="";
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n");buf=lines.pop();
    for(const l of lines){
      if(!l.startsWith("data:"))continue;
      const raw=l.slice(5).trim();if(raw==="[DONE]")continue;
      try{onEvent(JSON.parse(raw));}catch{ /* ignore parse errors */ }
    }
  }
}

function geminiRequest({messages,system,_geminiKey,_maxTok=DEFAULT_MAX_TOK,_model=DEFAULT_GEMINI,stream=false}) {
  if(!_geminiKey)throw new Error("Gemini API key not set — add it in ⚙ Settings.");
  const method=stream?"streamGenerateContent?alt=sse&":"generateContent?";
  return {
    url:`https://generativelanguage.googleapis.com/v1beta/models/${_model}:${method}key=${_geminiKey}`,
    init:{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        contents:messages.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),
        generationConfig:{maxOutputTokens:_maxTok},
        ...(system?{systemInstruction:{parts:[{text:system}]}}:{}),
      }),
    },
  };
}

function claudeRequest({messages,system,_key="",_proxy="",_jwt="",_maxTok=DEFAULT_MAX_TOK,_model="",stream=false}) {
  const up=!!_proxy;
  return {
    url:up?_proxy:"https://api.anthropic.com/v1/messages",
    init:{
      method:"POST",
      headers:up
        ?{"Content-Type":"application/json","Authorization":`Bearer ${_jwt||_key}`}
        :{"Content-Type":"application/json","x-api-key":_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:_model||DEFAULT_CLAUDE,max_tokens:_maxTok,...(stream?{stream:true}:{}),system,messages}),
    },
  };
}

async function streamRequest({url,init},{onToken,onDone,onErr,extractToken,errFallback}) {
  try{
    const res=await fetch(url,init);
    if(!res.ok){onErr(await httpErrorMessage(res,errFallback));return;}
    await readSSE(res,ev=>{const t=extractToken(ev);if(t)onToken(t);});
    onDone();
  }catch(e){onErr(e.message);}
}

const geminiToken=ev=>ev.candidates?.[0]?.content?.parts?.[0]?.text;
const claudeToken=ev=>ev.type==="content_block_delta"&&ev.delta?.type==="text_delta"?ev.delta.text:null;

export async function streamClaude({messages,system,onToken,onDone,onErr,...opts}) {
  const gemini=isGemini(opts._model);
  let req;
  try{req=(gemini?geminiRequest:claudeRequest)({messages,system,...opts,stream:true});}
  catch(e){onErr(e.message);return;}
  await streamRequest(req,{
    onToken,onDone,onErr,
    extractToken:gemini?geminiToken:claudeToken,
    errFallback:gemini?"Gemini error":"Request failed",
  });
}

export async function callClaude({messages,system,...opts}) {
  const gemini=isGemini(opts._model);
  const {url,init}=(gemini?geminiRequest:claudeRequest)({messages,system,...opts});
  const res=await fetch(url,init);
  const d=await readJson(res,gemini?160:120);
  if(!res.ok)throw new Error(d.error?.message||`HTTP ${res.status}`);
  return gemini
    ?(d.candidates?.[0]?.content?.parts?.[0]?.text||"")
    :(d.content?.[0]?.text||"");
}

export async function compressCtx(ctx,goal,cA) {
  if(!ctx.length)return"";
  try{
    const s=await callClaude({
      system:"Summarize agent outputs into 3-5 compact sentences preserving ALL technical decisions, code, and key facts. No fluff.",
      messages:[{role:"user",content:`GOAL: ${goal}\n\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,600)}`).join("\n\n")}`}],
      ...cA,
    });
    return`\n\nPRIOR CONTEXT (compressed):\n${s}`;
  }catch{return`\n\nPRIOR CONTEXT:\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,300)}`).join("\n\n")}`;}
}
