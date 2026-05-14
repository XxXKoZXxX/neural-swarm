import { useState, useRef, useCallback, useEffect } from "react";

const AGENTS = {
  ARCHITECT:  { c:"#00ffe7", i:"⬡", sys:"You are a senior software architect. Design schemas, system breakdowns, and technical decisions. Be production-grade and concise." },
  CODER:      { c:"#39ff14", i:"⌨", sys:"You are a senior engineer. Write complete, runnable, production-ready code. Include a HOW TO RUN section." },
  DEBUGGER:   { c:"#ff6b35", i:"🐛", sys:"You are a debugging specialist. Find real bugs, explain each one clearly, output fully fixed code." },
  TESTER:     { c:"#ffdd00", i:"✓",  sys:"You are a QA engineer. Write complete test suites with edge cases, mocks, and assertions." },
  ANALYST:    { c:"#bf5fff", i:"◈",  sys:"You are a critical analyst. Score work /10, identify weaknesses, give prioritized improvements." },
  REFACTORER: { c:"#00b4ff", i:"↺",  sys:"You are a refactoring expert. Apply DRY, clean naming, patterns. Output change log + refactored code." },
  RESEARCHER: { c:"#ff3cac", i:"◉",  sys:"You are a technical researcher. Deep research with comparisons, tradeoffs, version-specific details." },
  WRITER:     { c:"#fff176", i:"✎",  sys:"You are a technical writer. Write READMEs, docs, reports. Adapt tone to the audience." },
  REVIEWER:   { c:"#ff6eb4", i:"👁",  sys:"You are a principal engineer. Code review: rate [CRITICAL/MAJOR/MINOR/NIT]. Correctness, security, performance." },
  DESIGNER:   { c:"#ff007f", i:"◇",  sys:"You are a UI/UX designer. Detailed visual direction: layout, palette, typography, components, UX flows." },
};
const PF_P=["Stoic Philosopher","Dark Detective","Mad Scientist","Corporate Lawyer","War General","Hacker Anarchist","Buddhist Monk","Wall Street Shark","Cold Bureaucrat","Silicon Valley CEO","Ancient Oracle","Rogue AI","Nihilist Scholar","Ruthless Strategist","Shadow Broker","Alien Anthropologist","Jaded Journalist","Burnt-Out Visionary"];
const PF_T=["Blunt & Brutal","Cold & Clinical","Poetic & Dense","Conspiratorial","Dry & Sardonic","Hyper-Technical","Cryptic Riddles","Bureaucratic","Raw & Unfiltered","Urgent Manifesto","Minimal & Precise","Noir Monologue"];
const PF_C=["Max 80 words","No questions allowed","Numbered steps only","One sentence per idea","No adjectives","Begin with a quote","Use an analogy","End with a warning","Include a contradiction","No passive voice","Start mid-thought","Use a code metaphor","Never explain why","Dense single paragraph","Return only the core truth"];
const FREE_LIMIT=5;
const PLAN_TOKENS={free:700,pro:1600,power:2800};
const COST_PER_TOK=0.000003;
const CATS=["All","Build","Debug","Research","Marketing","Other"];
const SORTS=["Popular","Top Rated","Newest"];
const BUILTIN_TEMPLATES=[
  {id:"t1",name:"Full App Builder",  desc:"Architect, code, test, and document a complete app.",      goal:"Build a complete ",       tags:["saas","build"],    cat:"Build",    c:"#00ffe7",price:0,usage:412},
  {id:"t2",name:"Bug Eliminator",    desc:"Deep debug, fix, and validate any codebase.",               goal:"Debug and fix:\n\n",      tags:["debug","fix"],     cat:"Debug",    c:"#ff6b35",price:0,usage:287},
  {id:"t3",name:"Code Review Pro",   desc:"Full review with severity ratings and refactored output.",  goal:"Review this code:\n\n",   tags:["review","quality"],cat:"Debug",    c:"#ff6eb4",price:0,usage:198},
  {id:"t4",name:"Research Brief",    desc:"Deep research with comparisons and an executive brief.",    goal:"Research in depth: ",     tags:["research","docs"], cat:"Research", c:"#ff3cac",price:0,usage:163},
  {id:"t5",name:"SaaS Marketing Kit",desc:"Copy, landing page brief, and ad angles for any SaaS.",    goal:"Write a marketing kit for: ",tags:["marketing"],    cat:"Marketing",c:"#bf5fff",price:0,usage:141},
  {id:"t6",name:"Design System",     desc:"Design direction, component breakdown, and starter code.", goal:"Design and build: ",       tags:["design","ui"],     cat:"Build",    c:"#ff007f",price:0,usage:99},
];

const T={bg:"#090b10",bg2:"#0a0d14",bg3:"#0d111a",border:"#1e2840",border2:"#1a2030",text:"#c8d0e0",muted:"#556",dim:"#334",cyan:"#00ffe7",green:"#39ff14",purple:"#bf5fff",orange:"#ff6b35",pink:"#ff3cac",yellow:"#ffdd00"};
const bi={width:"100%",background:T.bg3,border:`1px solid ${T.border}`,color:T.text,padding:"8px 10px",fontFamily:"'Courier New',monospace",fontSize:"13px",outline:"none",boxSizing:"border-box"};
const Btn=(c=T.cyan,d=false)=>({background:d?T.bg3:"transparent",border:`1px solid ${d?T.border:c}`,color:d?T.dim:c,padding:"8px 16px",fontFamily:"'Courier New',monospace",fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",cursor:d?"not-allowed":"pointer"});
const Dot=s=>({display:"inline-block",width:"6px",height:"6px",borderRadius:"50%",background:s==="done"?T.green:s==="running"?T.yellow:s==="error"?T.orange:T.border,marginRight:"5px"});
const lbl={color:T.muted,fontSize:"10px",textTransform:"uppercase",letterSpacing:"2px",marginBottom:"3px"};
const sec={color:T.dim,fontSize:"10px",textTransform:"uppercase",letterSpacing:"3px",marginBottom:"8px",marginTop:"14px"};
const rankScore=t=>(t.rating?parseFloat(t.rating):0)*2+Math.log10((t.usage||t.usage_count||0)+1);

// ── API ───────────────────────────────────────────────────────────────────────
async function streamClaude({messages,system,onToken,onDone,onErr,_key="",_proxy="",_jwt="",_maxTok=1000}) {
  const up=!!_proxy;
  const url=up?_proxy:"https://api.anthropic.com/v1/messages";
  const hdr=up?{"Content-Type":"application/json","Authorization":`Bearer ${_jwt||_key}`}:{"Content-Type":"application/json","x-api-key":_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"};
  try {
    const res=await fetch(url,{method:"POST",headers:hdr,body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:_maxTok,stream:true,system,messages})});
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
        try{const ev=JSON.parse(raw);if(ev.type==="content_block_delta"&&ev.delta?.type==="text_delta")onToken(ev.delta.text);}catch{}
      }
    }
    onDone();
  } catch(e){onErr(e.message);}
}
async function callClaude({messages,system,_key="",_proxy="",_jwt=""}) {
  const up=!!_proxy;
  const url=up?_proxy:"https://api.anthropic.com/v1/messages";
  const hdr=up?{"Content-Type":"application/json","Authorization":`Bearer ${_jwt||_key}`}:{"Content-Type":"application/json","x-api-key":_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"};
  const res=await fetch(url,{method:"POST",headers:hdr,body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system,messages})});
  const ct=res.headers.get("content-type")||"";
  if(!ct.includes("json")){const t=await res.text();throw new Error(`HTTP ${res.status}: ${t.slice(0,120)}`);}
  const d=await res.json();
  if(!res.ok)throw new Error(d.error?.message||`HTTP ${res.status}`);
  return d.content?.[0]?.text||"";
}
async function compressCtx(ctx,goal,_key,_proxy,_jwt) {
  if(!ctx.length)return"";
  try {
    const s=await callClaude({system:"Summarize agent outputs into 3-5 compact sentences preserving ALL technical decisions, code, and key facts. No fluff.",messages:[{role:"user",content:`GOAL: ${goal}\n\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,600)}`).join("\n\n")}`}],_key,_proxy,_jwt});
    return`\n\nPRIOR CONTEXT (compressed):\n${s}`;
  } catch{return`\n\nPRIOR CONTEXT:\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,300)}`).join("\n\n")}`;}
}

// ── SUPABASE ──────────────────────────────────────────────────────────────────
function mkDb(url,key) {
  const base=url.replace(/\/$/,"");
  const h={"Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${key}`};
  return {
    async ins(t,row){const r=await fetch(`${base}/rest/v1/${t}`,{method:"POST",headers:{...h,"Prefer":"return=representation"},body:JSON.stringify(row)});if(!r.ok)throw new Error((await r.json()).message);return r.json();},
    async sel(t,q=""){const r=await fetch(`${base}/rest/v1/${t}?${q}`,{headers:h});if(!r.ok)throw new Error((await r.json()).message);return r.json();},
    async del(t,id){await fetch(`${base}/rest/v1/${t}?id=eq.${id}`,{method:"DELETE",headers:h});},
  };
}
function mkAuth(url,key) {
  const base=url.replace(/\/$/,"");const h={"Content-Type":"application/json","apikey":key};
  return {
    async signIn(e,p){const r=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:"POST",headers:h,body:JSON.stringify({email:e,password:p})});const d=await r.json();if(!r.ok)throw new Error(d.error_description||"Failed");return d;},
    async signUp(e,p){const r=await fetch(`${base}/auth/v1/signup`,{method:"POST",headers:h,body:JSON.stringify({email:e,password:p})});const d=await r.json();if(!r.ok)throw new Error(d.error_description||"Failed");return d;},
  };
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────
function AgentCard({name,out}) {
  const ag=AGENTS[name];if(!ag)return null;
  return (
    <div style={{border:`1px solid ${out.status==="running"?ag.c:T.border}`,background:out.status==="running"?`${ag.c}08`:T.bg2,padding:"10px",marginBottom:"8px",boxShadow:out.status==="running"?`0 0 8px ${ag.c}22`:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
        <div style={{color:ag.c,fontSize:"11px",letterSpacing:"3px",fontWeight:"bold"}}>{ag.i} {name}</div>
        <div style={{display:"flex",gap:"5px",alignItems:"center"}}>
          <span style={Dot(out.status)}></span>
          <span style={{color:T.muted,fontSize:"10px"}}>{out.status}</span>
          {out.status==="done"&&<button onClick={()=>navigator.clipboard?.writeText(out.text)} style={{...Btn(T.dim),padding:"2px 8px",fontSize:"10px"}}>COPY</button>}
        </div>
      </div>
      <div style={{color:"#8af",fontSize:"12px",lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:"220px",overflowY:"auto"}}>{out.text}{out.status==="running"&&"▋"}</div>
    </div>
  );
}

function RunRow({run,onView,onBranch,onRestore,onDelete,pickDiff,diffA,diffB,onPickDiff}) {
  const isA=diffA?.id===run.id,isB=diffB?.id===run.id;
  return (
    <div style={{border:`1px solid ${isA||isB?T.yellow:T.border}`,background:T.bg2,padding:"9px",marginBottom:"7px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:pickDiff?"pointer":"default"}} onClick={()=>pickDiff&&onPickDiff(run)}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:T.text,fontSize:"12px",marginBottom:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(run.goal||"").slice(0,68)}</div>
        <div style={{display:"flex",gap:"7px",flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:T.cyan,fontSize:"10px"}}>⎇ {run.branch||"main"}</span>
          <span style={{color:T.dim,fontSize:"10px"}}>v{run.version_num||"?"}</span>
          {run.score&&<span style={{color:T.green,fontSize:"10px"}}>★ {run.score}</span>}
          {run.cost&&<span style={{color:T.yellow,fontSize:"10px"}}>⚡${parseFloat(run.cost).toFixed(4)}</span>}
          <span style={{color:T.dim,fontSize:"10px"}}>{new Date(run.created_at).toLocaleString()}</span>
          {Object.keys(run.agents||{}).slice(0,5).map(k=><span key={k} style={{color:AGENTS[k]?.c||T.muted,fontSize:"10px"}}>{AGENTS[k]?.i}</span>)}
        </div>
      </div>
      <div style={{display:"flex",gap:"3px",marginLeft:"7px",flexShrink:0}}>
        <button onClick={e=>{e.stopPropagation();onView(run);}}    style={{...Btn(T.cyan),padding:"3px 7px",fontSize:"10px"}}>VIEW</button>
        <button onClick={e=>{e.stopPropagation();onBranch(run);}}  style={{...Btn(T.yellow),padding:"3px 7px",fontSize:"10px"}} title="Branch">⎇</button>
        <button onClick={e=>{e.stopPropagation();onRestore(run);}} style={{...Btn("#3ecf8e"),padding:"3px 7px",fontSize:"10px"}} title="Restore">↺</button>
        <button onClick={e=>{e.stopPropagation();onDelete(run.id);}} style={{...Btn(T.orange),padding:"3px 7px",fontSize:"10px"}}>✕</button>
      </div>
    </div>
  );
}

function DiffView({a,b,onClose}) {
  const all=[...new Set([...Object.keys(a?.agents||{}),...Object.keys(b?.agents||{})])];
  return (
    <div style={{border:`1px solid ${T.border}`,background:T.bg,padding:"14px",marginBottom:"12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"10px"}}>
        <span style={{color:T.cyan,fontSize:"11px",letterSpacing:"2px"}}>⟷ DIFF</span>
        <button style={{...Btn(T.dim),padding:"3px 10px",fontSize:"10px"}} onClick={onClose}>CLOSE</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"10px"}}>
        {[{run:a,c:T.orange,l:"A"},{run:b,c:T.green,l:"B"}].map(({run,c,l})=>(
          <div key={l} style={{background:T.bg3,padding:"8px",border:`1px solid ${T.border}`}}>
            <div style={{color:c,fontSize:"10px",letterSpacing:"2px",marginBottom:"2px"}}>{l} · v{run?.version_num||"?"} · ⎇ {run?.branch||"main"}</div>
            <div style={{color:T.muted,fontSize:"10px"}}>{(run?.goal||"").slice(0,60)}</div>
          </div>
        ))}
      </div>
      {all.map(name=>{
        const ag=AGENTS[name],oA=a?.agents?.[name]?.text||"(none)",oB=b?.agents?.[name]?.text||"(none)",changed=oA!==oB;
        return (
          <div key={name} style={{marginBottom:"8px",border:`1px solid ${changed?ag?.c||T.border:T.border}`,background:T.bg2}}>
            <div style={{padding:"4px 10px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}>
              <span style={{color:ag?.c||T.text,fontSize:"10px",letterSpacing:"2px"}}>{ag?.i} {name}</span>
              <span style={{color:changed?T.yellow:T.muted,fontSize:"10px"}}>{changed?"CHANGED":"SAME"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
              <div style={{padding:"8px",borderRight:`1px solid ${T.border}`,color:"#8af",fontSize:"11px",maxHeight:"100px",overflowY:"auto",whiteSpace:"pre-wrap"}}>{oA.slice(0,400)}</div>
              <div style={{padding:"8px",color:changed?"#aff8af":"#8af",fontSize:"11px",maxHeight:"100px",overflowY:"auto",whiteSpace:"pre-wrap"}}>{oB.slice(0,400)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TplCard({t,onUse,onFork,canUse}) {
  const [hover,setHover]=useState(false);
  return (
    <div style={{border:`1px solid ${hover?t.c:T.border}`,background:T.bg2,padding:"14px",display:"flex",flexDirection:"column",position:"relative",transition:"border-color .15s"}} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <div style={{position:"absolute",top:"9px",right:"9px",background:t.price>0?`${T.yellow}22`:T.bg3,border:`1px solid ${t.price>0?T.yellow:T.border}44`,color:t.price>0?T.yellow:T.green,fontSize:"9px",padding:"1px 5px"}}>{t.price>0?`$${t.price}`:"FREE"}</div>
      <div style={{color:t.c,fontSize:"12px",fontWeight:"bold",marginBottom:"4px",paddingRight:"38px"}}>{t.name}</div>
      <div style={{color:T.muted,fontSize:"10px",marginBottom:"7px",lineHeight:1.6,flex:1}}>{(t.desc||"").slice(0,72)}</div>
      <div style={{display:"flex",gap:"3px",flexWrap:"wrap",marginBottom:"8px"}}>
        {(t.tags||[]).slice(0,3).map(g=><span key={g} style={{background:`${t.c}15`,border:`1px solid ${t.c}33`,color:t.c,fontSize:"9px",padding:"1px 4px"}}>{g}</span>)}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
        <span style={{color:T.dim,fontSize:"10px"}}>{t.usage||0} uses{t.rating?` · ★${t.rating}`:""}</span>
        {t.creator&&<span style={{color:T.dim,fontSize:"9px"}}>{t.creator.split("@")[0]}</span>}
      </div>
      <div style={{display:"flex",gap:"5px"}}>
        <button style={{...Btn(canUse?t.c:T.yellow),padding:"6px 0",fontSize:"10px",flex:2}} onClick={onUse}>{canUse?"USE →":`BUY $${t.price} →`}</button>
        <button title="Fork" style={{...Btn(T.muted),padding:"6px 9px",fontSize:"12px"}} onClick={onFork}>⑂</button>
      </div>
    </div>
  );
}

function PublishModal({goal,tplName,setTplName,tplDesc,setTplDesc,tplCat,setTplCat,tplPrice,setTplPrice,tplTags,setTplTags,onPublish,onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(9,11,16,.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div style={{width:"380px",border:`1px solid ${T.pink}`,background:T.bg2,padding:"22px",boxShadow:`0 0 30px ${T.pink}22`}}>
        <div style={{color:T.pink,fontSize:"11px",letterSpacing:"3px",marginBottom:"14px"}}>⚗ PUBLISH TEMPLATE</div>
        <div style={lbl}>Name</div><input style={{...bi,marginBottom:"9px"}} value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="My Template" />
        <div style={lbl}>Description</div><input style={{...bi,marginBottom:"9px"}} value={tplDesc} onChange={e=>setTplDesc(e.target.value)} placeholder="What this workflow does..." />
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px",marginBottom:"9px"}}>
          <div>
            <div style={lbl}>Category</div>
            <select style={{...bi,padding:"6px 8px",fontSize:"11px"}} value={tplCat} onChange={e=>setTplCat(e.target.value)}>
              {CATS.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div><div style={lbl}>Price ($)</div><input style={bi} value={tplPrice} onChange={e=>setTplPrice(e.target.value)} placeholder="0" /></div>
        </div>
        <div style={lbl}>Tags (comma-sep)</div>
        <input style={{...bi,marginBottom:"14px"}} value={tplTags} onChange={e=>setTplTags(e.target.value)} placeholder="saas, build, react" />
        <div style={{display:"flex",gap:"7px"}}>
          <button style={{...Btn(T.cyan),flex:1}} onClick={onPublish}>PUBLISH</button>
          <button style={{...Btn(T.dim),flex:1}} onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function UpgradeModal({used,sbUrl,jwt,onClose,onPro}) {
  const [busy,setBusy]=useState(null);

  const checkout=async(plan)=>{
    if(!sbUrl){alert("Set Supabase URL in ⚙ Settings first.");return;}
    setBusy(plan);
    try{
      const res=await fetch(sbUrl.replace(/\/$/,"")+"/functions/v1/stripe-checkout",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${jwt}`},
        body:JSON.stringify({plan}),
      });
      const ct=res.headers.get("content-type")||"";
      if(!ct.includes("json"))throw new Error(`stripe-checkout not deployed yet (HTTP ${res.status})`);
      const d=await res.json();
      if(d.error)throw new Error(d.error);
      if(d.url)window.location=d.url;
    }catch(e){alert(e.message);}
    setBusy(null);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(9,11,16,.94)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,fontFamily:"'Courier New',monospace"}}>
      <div style={{width:"460px",border:`1px solid ${T.purple}`,background:T.bg2,padding:"24px",boxShadow:`0 0 40px ${T.purple}33`}}>
        <div style={{color:T.purple,fontSize:"13px",letterSpacing:"3px",marginBottom:"8px"}}>◈ PLAN LIMIT REACHED</div>
        <div style={{color:T.muted,fontSize:"12px",marginBottom:"20px"}}>Used <span style={{color:T.yellow}}>{used}/{FREE_LIMIT}</span> free runs.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
          {[{n:"PRO",p:"$29/mo",plan:"pro",c:T.cyan,feats:["Unlimited runs","All 10 agents","Full history","Templates"]},{n:"POWER",p:"$79/mo",plan:"power",c:T.purple,feats:["Everything in Pro","Analytics","Team workspace","API access"]}].map(pl=>(
            <div key={pl.n} style={{border:`1px solid ${T.border}`,padding:"12px",background:T.bg3}}>
              <div style={{color:pl.c,fontSize:"11px",letterSpacing:"2px",marginBottom:"4px"}}>{pl.n}</div>
              <div style={{color:T.yellow,fontSize:"18px",fontWeight:"bold",marginBottom:"8px"}}>{pl.p}</div>
              {pl.feats.map(f=><div key={f} style={{color:T.muted,fontSize:"10px",marginBottom:"3px"}}>✓ {f}</div>)}
              <button
                style={{...Btn(pl.c,busy===pl.plan),width:"100%",marginTop:"10px",padding:"5px",fontSize:"10px"}}
                onClick={()=>checkout(pl.plan)}
                disabled={!!busy}
              >
                {busy===pl.plan?"LOADING...":"UPGRADE →"}
              </button>
            </div>
          ))}
        </div>
        <button style={{...Btn("#3ecf8e"),width:"100%",marginBottom:"6px",fontSize:"10px",padding:"6px"}} onClick={onPro}>✓ SIMULATE PRO (DEMO)</button>
        <button style={{...Btn(T.dim),width:"100%",fontSize:"10px",padding:"6px"}} onClick={onClose}>STAY ON FREE</button>
      </div>
    </div>
  );
}

function AuthModal({sbUrl,sbKey,onSession,onSkip}) {
  const [mode,setMode]=useState("login");const [email,setEmail]=useState("");const [pwd,setPwd]=useState("");
  const [busy,setBusy]=useState(false);const [err,setErr]=useState("");const [msg,setMsg]=useState("");
  const submit=async()=>{
    if(!sbUrl||!sbKey)return onSkip();
    setBusy(true);setErr("");setMsg("");
    try{
      const a=mkAuth(sbUrl,sbKey);
      const d=mode==="login"?await a.signIn(email,pwd):await a.signUp(email,pwd);
      if(mode==="signup"&&!d.access_token){setMsg("Check email to confirm.");setBusy(false);return;}
      onSession({access_token:d.access_token,email:d.user?.email||email});
    }catch(e){setErr(e.message);}
    setBusy(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(9,11,16,.94)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,fontFamily:"'Courier New',monospace"}}>
      <div style={{width:"330px",border:`1px solid ${T.border}`,background:T.bg2,padding:"22px"}}>
        <div style={{color:T.cyan,fontSize:"15px",fontWeight:"bold",letterSpacing:"4px",textAlign:"center",marginBottom:"18px"}}>⬡ NEURAL SWARM</div>
        <div style={{display:"flex",gap:"6px",marginBottom:"14px"}}>
          {["login","signup"].map(m=><button key={m} onClick={()=>setMode(m)} style={{...Btn(m===mode?T.cyan:T.dim),flex:1,padding:"5px"}}>{m==="login"?"SIGN IN":"SIGN UP"}</button>)}
        </div>
        <div style={lbl}>Email</div><input style={{...bi,marginBottom:"9px"}} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
        <div style={lbl}>Password</div><input style={{...bi,marginBottom:"14px"}} type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/>
        {err&&<div style={{color:T.orange,fontSize:"11px",marginBottom:"9px"}}>{err}</div>}
        {msg&&<div style={{color:T.green,fontSize:"11px",marginBottom:"9px"}}>{msg}</div>}
        <button style={{...Btn(T.cyan,busy),width:"100%",marginBottom:"7px"}} onClick={submit} disabled={busy}>{busy?"...":(mode==="login"?"SIGN IN":"CREATE ACCOUNT")}</button>
        <button style={{...Btn(T.dim),width:"100%",padding:"5px",fontSize:"10px"}} onClick={onSkip}>SKIP — USE WITHOUT ACCOUNT</button>
      </div>
    </div>
  );
}

const DEMO_LINES=[
  {c:T.dim,   t:'> dispatch "Build a production SaaS auth system"'},
  {c:T.cyan,  t:"⬡ ORCHESTRATOR → ARCHITECT → CODER → TESTER"},
  {c:T.cyan,  t:"⬡ ARCHITECT: Designing JWT schema + RLS policies..."},
  {c:T.green, t:"⌨ CODER: Writing Express middleware + Supabase hooks..."},
  {c:T.yellow,t:"✓ TESTER: Writing 14 integration test cases..."},
  {c:T.purple,t:"◈ OVERSEER: Score 9/10 — Production ready."},
];
function Landing({onStart,onSignIn}) {
  const [tick,setTick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>setTick(t=>(t+1)%(DEMO_LINES.length+3)),700);return()=>clearInterval(id);},[]);
  const ff="'Courier New',monospace";
  const caps=[
    {i:"⬡",t:"10 Specialized Agents",d:"Architect, Coder, Debugger, Tester, Analyst, Refactorer, Researcher, Writer, Reviewer, Designer"},
    {i:"⟷",t:"Version Control",d:"Branch, diff, restore. Git-style history for every AI output."},
    {i:"⚗",t:"Prompt Forge",d:`${PF_P.length*PF_T.length*PF_C.length} persona × tone × constraint combos to transform goals before dispatch.`},
    {i:"◈",t:"Overseer Scoring",d:"Every run scored /10 with gaps and next steps identified automatically."},
    {i:"⚡",t:"Supabase Persistence",d:"All runs auto-saved with history, cost tracking, and team access."},
    {i:"🛒",t:"Template Marketplace",d:"Save, fork, and publish reusable agent workflows. Charge for premium ones."},
  ];
  const plans=[
    {n:"FREE",p:"$0",per:"forever",c:T.muted,feats:["5 runs/month","3 agents/run","Basic history","Community templates"]},
    {n:"PRO",p:"$29",per:"/month",c:T.cyan,hot:true,feats:["Unlimited runs","All 10 agents","Full history + versioning","Save & share templates"]},
    {n:"POWER",p:"$79",per:"/month",c:T.purple,feats:["Everything in Pro","Cost analytics","Team workspace","API access"]},
  ];
  return (
    <>
    <NeuralSwarmBg/>
    <div style={{background:"transparent",color:T.text,fontFamily:ff,minHeight:"100vh"}}>
      <nav style={{borderBottom:`1px solid ${T.border2}`,padding:"12px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"rgba(9,11,16,.96)",zIndex:50}}>
        <div style={{color:T.cyan,fontSize:"15px",fontWeight:"bold",letterSpacing:"5px"}}>⬡ NEURAL SWARM</div>
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={onSignIn} style={{background:"none",border:`1px solid ${T.border}`,color:T.muted,padding:"6px 16px",fontFamily:ff,fontSize:"11px",letterSpacing:"2px",cursor:"pointer"}}>SIGN IN</button>
          <button onClick={onStart}  style={{background:T.cyan,border:"none",color:T.bg,padding:"6px 16px",fontFamily:ff,fontSize:"11px",letterSpacing:"2px",fontWeight:"bold",cursor:"pointer"}}>START FREE →</button>
        </div>
      </nav>
      <section style={{padding:"60px 40px",maxWidth:"1100px",margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"48px",alignItems:"center"}}>
        <div>
          <div style={{color:T.cyan,fontSize:"10px",letterSpacing:"5px",marginBottom:"12px",opacity:.7}}>MULTI-AGENT AI ORCHESTRATION</div>
          <h1 style={{fontSize:"36px",fontWeight:"bold",lineHeight:1.2,margin:"0 0 16px",color:"#fff"}}>Your AI Dev Team.<br/><span style={{color:T.cyan}}>On Demand.</span></h1>
          <p style={{color:"#667",fontSize:"13px",lineHeight:1.8,marginBottom:"24px"}}>Give a goal. Agents execute in sequence — architecting, coding, testing, reviewing. Every run versioned, scored, and saved.</p>
          <div style={{display:"flex",gap:"10px",marginBottom:"10px"}}>
            <button onClick={onStart} style={{background:T.cyan,border:"none",color:T.bg,padding:"11px 26px",fontFamily:ff,fontSize:"12px",letterSpacing:"3px",fontWeight:"bold",cursor:"pointer"}}>START FREE →</button>
            <button onClick={()=>document.getElementById("ns-pricing")?.scrollIntoView({behavior:"smooth"})} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,padding:"11px 20px",fontFamily:ff,fontSize:"11px",letterSpacing:"2px",cursor:"pointer"}}>PRICING</button>
          </div>
          <div style={{color:T.dim,fontSize:"10px"}}>No credit card · 5 free runs · Full access</div>
        </div>
        <div style={{background:T.bg2,border:`1px solid ${T.border}`,padding:"18px",boxShadow:`0 0 40px ${T.cyan}10`,minHeight:"170px"}}>
          <div style={{display:"flex",gap:"5px",marginBottom:"12px"}}>
            {["#ff5f56","#ffbd2e","#27c93f"].map(c=><span key={c} style={{width:"9px",height:"9px",borderRadius:"50%",background:c,display:"inline-block"}}/>)}
            <span style={{color:T.dim,fontSize:"10px",marginLeft:"8px",letterSpacing:"2px"}}>neural-swarm — bash</span>
          </div>
          {DEMO_LINES.slice(0,Math.min(tick,DEMO_LINES.length)).map((l,i)=><div key={i} style={{color:l.c,fontSize:"12px",marginBottom:"5px",lineHeight:1.5}}>{l.t}</div>)}
          {tick<DEMO_LINES.length+1&&<span style={{color:T.cyan}}>▋</span>}
          {tick>=DEMO_LINES.length+1&&<div style={{color:T.dim,fontSize:"10px",marginTop:"4px",opacity:.5}}>// restarting...</div>}
        </div>
      </section>
      <section style={{padding:"48px 40px",borderTop:`1px solid ${T.border2}`,background:T.bg2}}>
        <div style={{maxWidth:"1100px",margin:"0 auto"}}>
          <div style={{color:T.dim,fontSize:"10px",letterSpacing:"5px",textAlign:"center",marginBottom:"32px"}}>CAPABILITIES</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
            {caps.map(f=>(
              <div key={f.t} style={{border:`1px solid ${T.border}`,background:T.bg,padding:"16px"}}>
                <div style={{color:T.cyan,fontSize:"18px",marginBottom:"7px"}}>{f.i}</div>
                <div style={{color:T.text,fontSize:"12px",fontWeight:"bold",marginBottom:"5px"}}>{f.t}</div>
                <div style={{color:T.muted,fontSize:"10px",lineHeight:1.6}}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="ns-pricing" style={{padding:"48px 40px",borderTop:`1px solid ${T.border2}`}}>
        <div style={{maxWidth:"820px",margin:"0 auto"}}>
          <div style={{color:T.dim,fontSize:"10px",letterSpacing:"5px",textAlign:"center",marginBottom:"8px"}}>PRICING</div>
          <div style={{color:T.muted,fontSize:"12px",textAlign:"center",marginBottom:"28px"}}>Start free. Upgrade when you need more.</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
            {plans.map(pl=>(
              <div key={pl.n} style={{border:`1px solid ${pl.hot?pl.c:T.border}`,background:pl.hot?`${pl.c}08`:T.bg3,padding:"18px",position:"relative",boxShadow:pl.hot?`0 0 20px ${pl.c}15`:"none"}}>
                {pl.hot&&<div style={{position:"absolute",top:"-10px",left:"50%",transform:"translateX(-50%)",background:pl.c,color:T.bg,fontSize:"9px",letterSpacing:"2px",padding:"2px 10px",fontWeight:"bold"}}>POPULAR</div>}
                <div style={{color:pl.c,fontSize:"10px",letterSpacing:"3px",marginBottom:"5px"}}>{pl.n}</div>
                <div style={{display:"flex",alignItems:"baseline",gap:"4px",marginBottom:"12px"}}><span style={{color:"#fff",fontSize:"22px",fontWeight:"bold"}}>{pl.p}</span><span style={{color:T.muted,fontSize:"11px"}}>{pl.per}</span></div>
                {pl.feats.map(f=><div key={f} style={{color:T.muted,fontSize:"10px",marginBottom:"4px"}}>✓ {f}</div>)}
                {pl.n!=="FREE"&&<button onClick={onStart} style={{...Btn(pl.c),width:"100%",marginTop:"12px",padding:"6px",fontSize:"10px"}}>GET STARTED →</button>}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{padding:"48px 40px",borderTop:`1px solid ${T.border2}`,textAlign:"center"}}>
        <div style={{color:"#fff",fontSize:"20px",fontWeight:"bold",marginBottom:"18px"}}>Ready to ship faster?</div>
        <button onClick={onStart} style={{background:T.cyan,border:"none",color:T.bg,padding:"13px 36px",fontFamily:ff,fontSize:"12px",letterSpacing:"3px",fontWeight:"bold",cursor:"pointer"}}>LAUNCH THE SWARM →</button>
        <div style={{color:T.dim,fontSize:"10px",marginTop:"10px"}}>No credit card · 5 free runs</div>
      </section>
      <footer style={{borderTop:`1px solid ${T.border2}`,padding:"20px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"10px"}}>
        <div style={{color:T.dim,fontSize:"10px",letterSpacing:"2px"}}>© 2026 NEURAL SWARM</div>
        <div style={{display:"flex",gap:"20px"}}>
          <a href="/privacy.html" style={{color:T.dim,fontSize:"10px",letterSpacing:"2px",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color=T.cyan} onMouseLeave={e=>e.target.style.color=T.dim}>PRIVACY</a>
          <a href="/terms.html"   style={{color:T.dim,fontSize:"10px",letterSpacing:"2px",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color=T.cyan} onMouseLeave={e=>e.target.style.color=T.dim}>TERMS</a>
          <a href="mailto:michaelkosminsky@gmail.com" style={{color:T.dim,fontSize:"10px",letterSpacing:"2px",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color=T.cyan} onMouseLeave={e=>e.target.style.color=T.dim}>CONTACT</a>
        </div>
      </footer>
    </div>
    </>
  );
}

// ── NEURAL SWARM BACKGROUND ──────────────────────────────────────────────────
function NeuralSwarmBg({ agOut = {}, phase = 'idle' }) {
  const cvRef = useRef(null);
  const rafRef = useRef(null);
  const live = useRef({ agOut: {}, phase: 'idle', mx: -9999, my: -9999, clicks: [], t: 0 });

  useEffect(() => { live.current.agOut = agOut; live.current.phase = phase; }, [agOut, phase]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const AG_KEYS = Object.keys(AGENTS);

    const hexRgb = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const lerp = (a,b,t) => a+(b-a)*t;
    const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const onMM = e => { live.current.mx = e.clientX; live.current.my = e.clientY; };
    const onML = () => { live.current.mx = -9999; live.current.my = -9999; };
    const onCk = e => { live.current.clicks.push({ x: e.clientX, y: e.clientY, t: performance.now() }); };
    window.addEventListener('mousemove', onMM);
    document.addEventListener('mouseleave', onML);
    window.addEventListener('click', onCk);

    const ACOLS = ['#00ffe7','#39ff14','#bf5fff','#ff6b35','#ff3cac','#ffdd00','#00b4ff','#ff6eb4','#a78bfa','#3ecf8e'];
    const N_AMB = 52;

    const mkNode = (id, isAg, agKey) => {
      const z = isAg ? 0.65+Math.random()*.35 : 0.15+Math.random()*.85;
      return { id, x: Math.random()*cv.width, y: Math.random()*cv.height,
        z, vx: (Math.random()-.5)*.5*z, vy: (Math.random()-.5)*.5*z,
        col: isAg ? AGENTS[agKey].c : ACOLS[id%ACOLS.length],
        agKey: isAg ? agKey : null,
        r: isAg ? 3.2+Math.random()*1.8 : 0.8+z*2.2,
        glow: 0, pt: Math.random()*Math.PI*2 };
    };

    const nodes = [];
    for (let i = 0; i < N_AMB; i++) nodes.push(mkNode(i, false, null));
    AG_KEYS.forEach((k, i) => nodes.push(mkNode(N_AMB+i, true, k)));
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const packets = [], waves = [], fires = [];
    const prevSt = {};
    let noiseT = 0;

    const PHASE_TINT = {
      idle:[0,0,0], orchestrating:[14,9,0], running:[0,14,14], overseeing:[9,0,18], done:[0,14,7]
    };

    function frame(now) {
      const dt = clamp((now-(live.current.t||now-16.67))/16.67, .05, 3);
      live.current.t = now;
      noiseT += .0008*dt;
      const W = cv.width, H = cv.height;
      const L = live.current;
      const { mx, my, phase, agOut } = L;
      L.clicks = L.clicks.filter(c => now-c.t < 1200);

      const [tr,tg,tb] = PHASE_TINT[phase]||PHASE_TINT.idle;
      ctx.fillStyle = `rgba(${9+tr},${11+tg},${16+tb},0.15)`;
      ctx.fillRect(0, 0, W, H);

      const speedM = phase==='running' ? 1.55 : phase==='orchestrating' ? 1.2 : 1;

      for (const n of nodes) {
        n.pt += .02*dt;
        const st = n.agKey ? agOut[n.agKey]?.status : null;
        n.glow = lerp(n.glow, st==='running'?1:st==='done'?.45:st==='error'?.75:0, .055*dt);

        if (n.agKey) {
          const prev = prevSt[n.agKey];
          if (st==='running' && prev!=='running')
            waves.push({ x:n.x, y:n.y, r:n.r, max:100+Math.random()*70, col:n.col, a:.85 });
          prevSt[n.agKey] = st;
        }

        const nx = Math.sin(noiseT*1.73+n.id*.37)*Math.cos(noiseT*.91+n.id*.71) * .014*n.z;
        const ny = Math.cos(noiseT*2.09+n.id*.51)*Math.sin(noiseT*1.31+n.id*.29) * .014*n.z;

        const mdx = n.x-mx, mdy = n.y-my, md2 = mdx*mdx+mdy*mdy;
        if (md2 < 160*160 && md2 > 1) {
          const md = Math.sqrt(md2);
          n.vx += (mdx/md)*(1-md/160)*.75*dt;
          n.vy += (mdy/md)*(1-md/160)*.75*dt;
        }

        for (const c of L.clicks) {
          const cdx=c.x-n.x, cdy=c.y-n.y, cd=Math.sqrt(cdx*cdx+cdy*cdy), age=(now-c.t)/1200;
          if (cd<280 && cd>1) { const f=(1-cd/280)*(1-age)*3; n.vx+=cdx/cd*f*dt; n.vy+=cdy/cd*f*dt; }
        }

        n.vx += (W*.5-n.x)*.000028*dt;
        n.vy += (H*.5-n.y)*.000028*dt;
        n.vx = (n.vx+nx)*(1-.024*dt); n.vy = (n.vy+ny)*(1-.024*dt);
        const spd = Math.sqrt(n.vx*n.vx+n.vy*n.vy), ms = .72*n.z*speedM;
        if (spd>ms) { n.vx*=ms/spd; n.vy*=ms/spd; }
        n.x += n.vx*dt; n.y += n.vy*dt;
        const m=75;
        if(n.x<m)n.vx+=(m-n.x)*.003*dt; if(n.x>W-m)n.vx-=(n.x-(W-m))*.003*dt;
        if(n.y<m)n.vy+=(m-n.y)*.003*dt; if(n.y>H-m)n.vy-=(n.y-(H-m))*.003*dt;
      }

      const DIST=160, ADIST=225;
      const connCount = new Map(nodes.map(n=>[n.id,0]));

      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const a=nodes[i], b=nodes[j];
        const dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy;
        const thr=(a.agKey||b.agKey)?ADIST:DIST;
        if (d2>thr*thr) continue;
        const d=Math.sqrt(d2), t=1-d/thr;
        connCount.set(a.id,(connCount.get(a.id)||0)+1);
        connCount.set(b.id,(connCount.get(b.id)||0)+1);
        const aAct=a.agKey&&agOut[a.agKey]?.status==='running';
        const bAct=b.agKey&&agOut[b.agKey]?.status==='running';
        const active=aAct||bAct;
        const alpha=t*(active?.52:.1)*Math.min(a.z,b.z);
        const [ar,ag_,ab_]=hexRgb(a.col),[br,bg_,bb_]=hexRgb(b.col);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
        ctx.strokeStyle=`rgba(${(ar+br)>>1},${(ag_+bg_)>>1},${(ab_+bb_)>>1},${alpha})`;
        ctx.lineWidth=active?t*1.9:t*.65; ctx.stroke();
        if (active&&Math.random()<.0018*dt)
          packets.push({ai:a.id,bi:b.id,p:0,s:.003+Math.random()*.005,col:Math.random()<.5?a.col:b.col,fwd:Math.random()<.5});
        if (!active&&Math.random()<.00007*dt)
          fires.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,col:a.col,life:.7});
      }

      for (let i=fires.length-1;i>=0;i--) {
        const f=fires[i]; f.life-=.065*dt;
        if(f.life<=0){fires.splice(i,1);continue;}
        const [fr,fg_,fb_]=hexRgb(f.col);
        ctx.beginPath(); ctx.moveTo(f.x1,f.y1); ctx.lineTo(f.x2,f.y2);
        ctx.strokeStyle=`rgba(${fr},${fg_},${fb_},${f.life})`; ctx.lineWidth=1.6; ctx.stroke();
      }

      for (let i=waves.length-1;i>=0;i--) {
        const w=waves[i]; w.r+=2.4*dt; w.a-=.014*dt;
        if(w.a<=0||w.r>w.max){waves.splice(i,1);continue;}
        const [wr,wg,wb]=hexRgb(w.col);
        ctx.beginPath(); ctx.arc(w.x,w.y,w.r,0,Math.PI*2);
        ctx.strokeStyle=`rgba(${wr},${wg},${wb},${w.a})`; ctx.lineWidth=1.5; ctx.stroke();
      }

      for (let i=packets.length-1;i>=0;i--) {
        const pk=packets[i], na=nodeMap.get(pk.ai), nb=nodeMap.get(pk.bi);
        if(!na||!nb){packets.splice(i,1);continue;}
        pk.p+=pk.s*dt;
        if(pk.p>=1){packets.splice(i,1);continue;}
        const [fx,fy,tx,ty]=pk.fwd?[na.x,na.y,nb.x,nb.y]:[nb.x,nb.y,na.x,na.y];
        const px=lerp(fx,tx,pk.p), py=lerp(fy,ty,pk.p);
        const [cr,cg,cb]=hexRgb(pk.col);
        ctx.beginPath(); ctx.arc(px,py,2.6,0,Math.PI*2);
        ctx.fillStyle=`rgba(${cr},${cg},${cb},.9)`; ctx.fill();
        for(let ti=1;ti<=4;ti++){
          const tp=Math.max(0,pk.p-ti*.022);
          ctx.beginPath(); ctx.arc(lerp(fx,tx,tp),lerp(fy,ty,tp),2.6-ti*.45,0,Math.PI*2);
          ctx.fillStyle=`rgba(${cr},${cg},${cb},${.55-ti*.11})`; ctx.fill();
        }
      }

      for (const n of nodes) {
        const pulse=.78+.22*Math.sin(n.pt);
        const nr=n.r*pulse*(1+n.glow*.55);
        const cc=connCount.get(n.id)||0, hub=Math.min(cc/8,1)*.35;
        const [R,G,B]=hexRgb(n.col);
        const st=n.agKey?agOut[n.agKey]?.status:null;
        const gr=st==='error'?[248,81,73]:[R,G,B];
        if(n.glow+hub>.05){
          const gR=nr*(7+(n.glow+hub)*15);
          const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,gR);
          g.addColorStop(0,`rgba(${gr[0]},${gr[1]},${gr[2]},${(n.glow+hub)*.32})`);
          g.addColorStop(1,`rgba(${gr[0]},${gr[1]},${gr[2]},0)`);
          ctx.beginPath(); ctx.arc(n.x,n.y,gR,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(n.x,n.y,nr,0,Math.PI*2);
        ctx.fillStyle=`rgba(${R},${G},${B},${n.agKey?(.65+n.glow*.35):(.2+n.z*.3)})`;
        ctx.fill();
        if(n.agKey&&n.glow>.28){
          ctx.font=`${8+n.glow*5}px monospace`;
          ctx.fillStyle=`rgba(${R},${G},${B},${n.glow*.8})`;
          ctx.textAlign='center'; ctx.fillText(AGENTS[n.agKey].i,n.x,n.y-nr-4);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    ctx.fillStyle='#090b10'; ctx.fillRect(0,0,cv.width,cv.height);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMM);
      document.removeEventListener('mouseleave', onML);
      window.removeEventListener('click', onCk);
    };
  }, []);

  return <canvas ref={cvRef} style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none',opacity:.72}}/>;
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [landed,   setLanded]   = useState(false);
  const [apiKey,   setApiKey]   = useState(""); const [showKey,   setShowKey]   = useState(false);
  const [proxyUrl, setProxyUrl] = useState("https://mrqblfyxwdgaarlemufo.supabase.co/functions/v1/swarm-proxy");
  const [sbUrl,    setSbUrl]    = useState("https://mrqblfyxwdgaarlemufo.supabase.co"); const [sbKey,    setSbKey]    = useState("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ycWJsZnl4d2RnYWFybGVtdWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDg3NzQsImV4cCI6MjA5MTkyNDc3NH0.Xl0vNkUqMmh0036c-bmaHrGpbNdknim69RRyUOXHIqo"); const [showSbKey,setShowSbKey]=useState(false);
  const [settings, setSettings] = useState(false);
  const [session,  setSession]  = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [plan,     setPlan]     = useState("free");
  const [runCount, setRunCount] = useState(0);
  const [showUpg,  setShowUpg]  = useState(false);
  const [tab,      setTab]      = useState("swarm");
  const [goal,     setGoal]     = useState("");
  const [running,  setRunning]  = useState(false);
  const [agOut,    setAgOut]    = useState({});
  const [overseer, setOverseer] = useState("");
  const [phase,    setPhase]    = useState("idle");
  const [logs,     setLogs]     = useState([]);
  const [branch,   setBranch]   = useState("main");
  const [commitMsg,setCommitMsg]= useState("");
  const [sbStatus, setSbStatus] = useState("");
  const [runCost,  setRunCost]  = useState(0);
  const [forgeOpen,setForgeOpen]= useState(false);
  const [pfP,setPfP]=useState(PF_P[2]);const [pfT,setPfT]=useState(PF_T[0]);const [pfC,setPfC]=useState(PF_C[0]);
  const [pfRaw,setPfRaw]=useState("");const [pfOut,setPfOut]=useState("");const [pfBusy,setPfBusy]=useState(false);
  const [runs,       setRuns]      = useState([]);const [runsLoading,setRunsLoading]=useState(false);
  const [viewRun,    setViewRun]   = useState(null);
  const [diffA,      setDiffA]     = useState(null);const [diffB,setDiffB]=useState(null);const [pickDiff,setPickDiff]=useState(false);
  const [brFilter,   setBrFilter]  = useState("all");
  const [dbTpls,     setDbTpls]    = useState([]);
  const [savedTpls,  setSavedTpls] = useState([]);
  const [saveOpen,   setSaveOpen]  = useState(false);
  const [tplName,setTplName]=useState("");const [tplDesc,setTplDesc]=useState("");const [tplCat,setTplCat]=useState("Build");const [tplPrice,setTplPrice]=useState("0");const [tplTags,setTplTags]=useState("");
  const [mktCat,setMktCat]=useState("All");const [mktSearch,setMktSearch]=useState("");const [mktSort,setMktSort]=useState("Popular");
  const [purchased,  setPurchased] = useState(new Set());
  const [forkedFrom, setForkedFrom]= useState(null);
  const abortRef=useRef(false);

  const isGated=plan==="free"&&runCount>=FREE_LIMIT;
  const jwt=session?.access_token||sbKey;
  const cA={_key:apiKey,_proxy:proxyUrl,_jwt:jwt};
  const phaseColor={idle:T.dim,orchestrating:T.yellow,running:T.cyan,overseeing:T.purple,done:T.green};
  const branches=["all",...new Set(["main",...runs.map(r=>r.branch||"main")])];
  const addLog=m=>setLogs(p=>[...p.slice(-60),`${new Date().toLocaleTimeString()} — ${m}`]);

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get("purchase")==="success"){
      const tid=p.get("template");
      if(tid)setPurchased(prev=>new Set([...prev,tid]));
      addLog("Purchase confirmed ✓");
      window.history.replaceState({},"",window.location.pathname);
      setTab("templates");
    }
    // Handle Stripe subscription success redirect
    if(p.get("upgraded")==="true"){
      const newPlan=p.get("plan")||"pro";
      setPlan(newPlan);
      addLog(`Upgraded to ${newPlan.toUpperCase()} ✓`);
      window.history.replaceState({},"",window.location.pathname);
    }
  },[]);

  const loadRuns=useCallback(async()=>{
    if(!sbUrl||!sbKey)return;
    setRunsLoading(true);
    try{const rows=await mkDb(sbUrl,sbKey).sel("agent_runs","select=*&order=created_at.desc&limit=40");setRuns(rows);addLog(`Loaded ${rows.length} runs.`);}
    catch(e){addLog("Load error: "+e.message);}
    setRunsLoading(false);
  },[sbUrl,sbKey]);

  const loadDbTpls=useCallback(async()=>{
    if(!sbUrl||!sbKey)return;
    try{const rows=await mkDb(sbUrl,sbKey).sel("templates","select=*&is_public=eq.true&order=usage_count.desc&limit=40");setDbTpls(rows);}
    catch{}
  },[sbUrl,sbKey]);

  useEffect(()=>{
    if(tab==="history"||tab==="dashboard")loadRuns();
    if(tab==="templates")loadDbTpls();
  },[tab,loadRuns,loadDbTpls]);

  const handleForge=useCallback(async()=>{
    if(!proxyUrl&&!apiKey)return alert("Enter API key or proxy URL in ⚙ Settings.");
    setPfBusy(true);setPfOut("");
    await streamClaude({system:`You are a ${pfP}. Respond in ${pfT} tone. Constraint: ${pfC}. Transform or generate the user's prompt. Output ONLY the reforged prompt.`,messages:[{role:"user",content:pfRaw.trim()||"Generate a powerful software goal."}],onToken:t=>setPfOut(o=>o+t),onDone:()=>setPfBusy(false),onErr:e=>{setPfOut("ERROR: "+e);setPfBusy(false);},...cA});
  },[apiKey,proxyUrl,pfP,pfT,pfC,pfRaw,jwt]);

  const saveRun=useCallback(async(outputs,ovText,tokens)=>{
    if(!sbUrl||!sbKey){setSbStatus("nosupa");return;}
    setSbStatus("saving");
    try{
      const score=(ovText.match(/(\d+)\s*\/\s*10/)||[])[1];
      const verNum=runs.filter(r=>(r.branch||"main")===branch).length+1;
      await mkDb(sbUrl,sbKey).ins("agent_runs",{goal,branch,version_num:verNum,run_message:commitMsg||`v${verNum}`,agents:Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,{text:v.text,status:v.status}])),overseer:ovText,score:score?score+"/10":null,tokens_used:tokens,cost:(tokens*COST_PER_TOK).toFixed(6),user_email:session?.email||null,is_template:false});
      setSbStatus("saved");addLog("Saved ✓");
    }catch(e){setSbStatus("error");addLog("Save error: "+e.message);}
  },[sbUrl,sbKey,goal,branch,commitMsg,runs,session]);

  const handleRun=useCallback(async()=>{
    if(!proxyUrl&&!apiKey)return alert("Enter API key or proxy URL in ⚙ Settings.");
    if(!goal.trim())return alert("Enter a goal.");
    if(isGated){setShowUpg(true);return;}
    abortRef.current=false;setRunning(true);setPhase("orchestrating");
    setAgOut({});setOverseer("");setLogs([]);setSbStatus("");setRunCost(0);
    addLog(proxyUrl?"Routing via proxy...":"Direct API mode.");
    let plan_;
    try{
      const raw=await callClaude({system:`You are an orchestrator for a multi-agent AI system. Available: ${Object.keys(AGENTS).join(", ")}. Pick 2-5 agents for the user's goal in execution order. Write specific instructions per agent. Respond ONLY as valid JSON: {"agents":[{"name":"AGENT_NAME","instruction":"..."}]}`,messages:[{role:"user",content:goal}],...cA});
      plan_=JSON.parse(raw.replace(/```json|```/g,"").trim());
      addLog("Plan: "+plan_.agents.map(a=>a.name).join(" → "));
    }catch(e){addLog("Orchestrator error: "+e.message);setPhase("idle");setRunning(false);return;}
    setPhase("running");
    const ctx=[],finals={};let totalTok=0;
    const maxTok=PLAN_TOKENS[plan]||PLAN_TOKENS.free;
    for(const step of plan_.agents) {
      if(abortRef.current)break;
      const ag=AGENTS[step.name];if(!ag)continue;
      addLog(`[${step.name}] starting...`);
      setAgOut(p=>({...p,[step.name]:{text:"",status:"running"}}));
      const ctxBlock=ctx.length>=2?await compressCtx(ctx,goal,cA._key,cA._proxy,cA._jwt):ctx.length?`\n\nPREVIOUS OUTPUTS:\n${ctx.map(c=>`[${c.agent}]: ${c.output.slice(0,500)}`).join("\n\n")}` :"";
      let full="",tokCount=0;
      await streamClaude({system:ag.sys,messages:[{role:"user",content:`GOAL: ${goal}\n\nTASK: ${step.instruction}${ctxBlock}`}],
        onToken:t=>{full+=t;tokCount++;setAgOut(p=>({...p,[step.name]:{text:(p[step.name]?.text||"")+t,status:"running"}}));},
        onDone:()=>{totalTok+=tokCount;setRunCost(totalTok*COST_PER_TOK);setAgOut(p=>({...p,[step.name]:{...p[step.name],status:"done"}}));ctx.push({agent:step.name,output:full});finals[step.name]={text:full,status:"done"};addLog(`[${step.name}] done. ~${tokCount} tok`);},
        onErr:e=>{setAgOut(p=>({...p,[step.name]:{text:"ERROR: "+e,status:"error"}}));finals[step.name]={text:"ERROR: "+e,status:"error"};addLog(`[${step.name}] error.`);},
        ...cA,_maxTok:maxTok});
    }
    setPhase("overseeing");addLog("Overseer evaluating...");
    let ov="";
    await streamClaude({system:"You are an Overseer AI. Evaluate agent outputs against the user's goal. Score /10. List what's missing, corrections, concrete next steps.",messages:[{role:"user",content:`GOAL: ${goal}\n\nOUTPUTS:\n${ctx.map(c=>`[${c.agent}]:\n${c.output}`).join("\n\n---\n\n")}`}],
      onToken:t=>{ov+=t;setOverseer(o=>o+t);},
      onDone:async()=>{addLog("Complete. ~"+totalTok+" tokens total");setPhase("done");setRunning(false);setRunCount(c=>c+1);await saveRun(finals,ov,totalTok);await loadRuns();},
      onErr:e=>{setOverseer("ERROR: "+e);setPhase("done");setRunning(false);},
      ...cA,_maxTok:maxTok});
  },[apiKey,proxyUrl,goal,plan,isGated,jwt,saveRun,loadRuns]);

  const branchFrom=run=>{setGoal(run.goal||"");setBranch("branch-"+Date.now().toString(36));setCommitMsg("Branched from v"+(run.version_num||"?"));setTab("swarm");};
  const restoreRun=run=>{setGoal(run.goal||"");setBranch(run.branch||"main");setCommitMsg("Restored v"+(run.version_num||"?"));setTab("swarm");};
  const deleteRun=id=>{mkDb(sbUrl,sbKey).del("agent_runs",id).then(()=>setRuns(p=>p.filter(r=>r.id!==id))).catch(()=>{});};

  const handlePickDiff=run=>{
    if(!diffA)setDiffA(run);
    else if(!diffB&&run.id!==diffA.id){setDiffB(run);setPickDiff(false);}
  };

  const handlePublish=()=>{
    if(!tplName.trim())return;
    setSavedTpls(p=>[...p,{id:"u"+Date.now(),name:tplName,goal,c:T.cyan}]);
    if(sbUrl&&sbKey)mkDb(sbUrl,sbKey).ins("templates",{name:tplName,description:tplDesc,goal_template:goal,agent_flow:[],tags:tplTags.split(",").map(s=>s.trim()).filter(Boolean),category:tplCat,price:parseFloat(tplPrice)||0,is_public:true,creator_email:session?.email||null}).then(()=>loadDbTpls()).catch(()=>{});
    setTplName("");setTplDesc("");setTplPrice("0");setTplTags("");setSaveOpen(false);
  };

  const handlePurchase=async t=>{
    if(t.price===0||purchased.has(t.id)){setGoal(t.goal||"");setTab("swarm");return;}
    if(!sbUrl){alert("Set Supabase URL in ⚙ Settings to enable purchases.");return;}
    try{
      addLog(`Opening Stripe checkout for "${t.name}"...`);
      const res=await fetch(sbUrl.replace(/\/$/,"")+"/functions/v1/stripe-checkout",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${jwt}`},body:JSON.stringify({templateId:t.id})});
      const ct=res.headers.get("content-type")||"";
      if(!ct.includes("json"))throw new Error(`Checkout ${res.status} — deploy stripe-checkout function first.`);
      const d=await res.json();
      if(d.already_purchased){setPurchased(p=>new Set([...p,t.id]));setGoal(t.goal||"");setTab("swarm");return;}
      if(d.error)throw new Error(d.error);
      if(d.url)window.open(d.url,"_blank");
    }catch(e){addLog("Stripe: "+e.message);alert(e.message);}
  };

  const agUsage=Object.fromEntries(Object.keys(AGENTS).map(k=>[k,0]));
  runs.forEach(r=>Object.keys(r.agents||{}).forEach(k=>{if(agUsage[k]!==undefined)agUsage[k]++;}));
  const maxU=Math.max(1,...Object.values(agUsage));
  const scores=runs.filter(r=>r.score).map(r=>parseInt(r.score));
  const avgScore=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):"—";
  const today=runs.filter(r=>new Date(r.created_at)>new Date(Date.now()-86400000)).length;
  const totalCost=runs.reduce((s,r)=>s+parseFloat(r.cost||0),0);

  const allTpls=[
    ...BUILTIN_TEMPLATES,
    ...dbTpls.map(t=>({id:t.id,name:t.name,desc:t.description,goal:t.goal_template,tags:t.tags||[],cat:t.category||"Other",c:"#3ecf8e",price:t.price||0,usage:t.usage_count||0,rating:t.rating_count>0?(t.rating_sum/t.rating_count).toFixed(1):null,creator:t.creator_email})),
  ];
  const filteredTpls=allTpls
    .filter(t=>(mktCat==="All"||t.cat===mktCat)&&(!mktSearch||(t.name+t.desc+(t.tags||[]).join(" ")).toLowerCase().includes(mktSearch.toLowerCase())))
    .sort((a,b)=>mktSort==="Popular"?(b.usage||0)-(a.usage||0):mktSort==="Top Rated"?rankScore(b)-rankScore(a):0);

  const filteredRuns=runs.filter(r=>brFilter==="all"||(r.branch||"main")===brFilter);

  if(!landed)return <Landing onStart={()=>setLanded(true)} onSignIn={()=>{setLanded(true);setShowAuth(true);}}/>;

  return (
    <>
    <NeuralSwarmBg agOut={agOut} phase={phase}/>
    <div style={{background:"transparent",color:T.text,fontFamily:"'Courier New',monospace",minHeight:"100vh",fontSize:"13px"}}>
      {/* HEADER */}
      <div style={{background:T.bg2,borderBottom:`1px solid ${T.border2}`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={()=>setLanded(false)} style={{background:"none",border:"none",color:T.cyan,fontSize:"14px",fontWeight:"bold",letterSpacing:"5px",cursor:"pointer",fontFamily:"inherit",padding:0}}>⬡ NS</button>
          <div style={{display:"flex"}}>
            {[["swarm","⬡ SWARM"],["templates","🛒 MARKET"],["history","◈ HISTORY"],["dashboard","◉ DASH"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:t===tab?`${T.cyan}12`:"transparent",border:"none",borderBottom:t===tab?`2px solid ${T.cyan}`:"2px solid transparent",color:t===tab?T.cyan:T.muted,padding:"5px 11px",fontFamily:"inherit",fontSize:"10px",letterSpacing:"2px",cursor:"pointer",textTransform:"uppercase"}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
          {isGated&&<button style={{...Btn(T.purple),padding:"3px 10px",fontSize:"10px"}} onClick={()=>setShowUpg(true)}>↑ UPGRADE</button>}
          <div style={{border:`1px solid ${plan==="pro"?T.purple:T.border}`,color:plan==="pro"?T.purple:T.muted,padding:"2px 8px",fontSize:"10px",background:plan==="pro"?`${T.purple}11`:T.bg3}}>
            {plan.toUpperCase()}{plan==="free"?` ${runCount}/${FREE_LIMIT}`:""}
          </div>
          <span style={{...Dot(phase),width:"7px",height:"7px"}}/>
          <span style={{color:phaseColor[phase],fontSize:"10px",letterSpacing:"2px"}}>{phase.toUpperCase()}</span>
          {session?<span style={{color:T.dim,fontSize:"10px"}}>{session.email?.slice(0,16)}</span>:<button style={{...Btn(T.dim),padding:"3px 10px",fontSize:"10px"}} onClick={()=>setShowAuth(true)}>SIGN IN</button>}
          <button onClick={()=>setSettings(p=>!p)} style={{background:"none",border:`1px solid ${settings?T.cyan:T.border2}`,color:T.dim,padding:"3px 9px",fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>⚙</button>
        </div>
      </div>

      {/* SETTINGS */}
      {settings&&(
        <div style={{background:T.bg3,borderBottom:`1px solid ${T.border}`,padding:"10px 14px",display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"flex-end"}}>
          {[["Anthropic Key",apiKey,setApiKey,showKey,setShowKey,"sk-ant-..."],["Proxy URL",proxyUrl,setProxyUrl,false,null,"https://xyz.supabase.co/functions/v1/swarm-proxy"],["Supabase URL",sbUrl,setSbUrl,false,null,"https://xyz.supabase.co"],["Supabase Key",sbKey,setSbKey,showSbKey,setShowSbKey,"eyJ..."]].map(([label,val,setter,show,setShow,ph])=>(
            <div key={label} style={{flex:"0 0 195px"}}>
              <div style={lbl}>{label}</div>
              <div style={{position:"relative"}}>
                <input style={{...bi,paddingRight:setShow?"44px":"10px"}} type={show?"text":"password"} value={val} onChange={e=>setter(e.target.value)} placeholder={ph}/>
                {setShow&&<button onClick={()=>setShow(p=>!p)} style={{position:"absolute",right:"6px",top:"7px",background:"none",border:"none",color:T.muted,fontSize:"10px",cursor:"pointer",fontFamily:"inherit"}}>{show?"HIDE":"SHOW"}</button>}
              </div>
            </div>
          ))}
          <button style={{...Btn(T.dim),padding:"6px 12px",fontSize:"10px"}} onClick={()=>setSettings(false)}>DONE</button>
        </div>
      )}

      <div style={{padding:"14px"}}>
        {/* ── SWARM ── */}
        {tab==="swarm"&&(
          <div style={{display:"grid",gridTemplateColumns:"252px 1fr",gap:"12px"}}>
            <div>
              {forkedFrom&&phase==="idle"&&(
                <div style={{border:`1px solid ${T.yellow}44`,background:`${T.yellow}08`,padding:"7px 10px",marginBottom:"8px",fontSize:"10px",color:T.yellow,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>⑂ Forked: <strong>{forkedFrom}</strong></span>
                  <button onClick={()=>setForkedFrom(null)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:"11px"}}>✕</button>
                </div>
              )}
              {runCount===0&&phase==="idle"&&!running&&(
                <div style={{border:`1px solid ${T.cyan}22`,background:`${T.cyan}06`,padding:"9px 10px",marginBottom:"8px",fontSize:"10px",color:T.muted,lineHeight:1.6}}>
                  <span style={{color:T.cyan}}>⬡ FIRST RUN</span> — Enter a goal, hit DISPATCH.
                </div>
              )}
              <div style={sec}><button onClick={()=>setForgeOpen(p=>!p)} style={{background:"none",border:"none",color:T.pink,cursor:"pointer",fontFamily:"inherit",fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",padding:0}}>⚗ FORGE {forgeOpen?"▲":"▼"}</button></div>
              {forgeOpen&&(
                <div style={{border:"1px solid #2a1030",background:"#0c0810",padding:"10px",marginBottom:"8px"}}>
                  {[[pfP,setPfP,PF_P],[pfT,setPfT,PF_T],[pfC,setPfC,PF_C]].map(([val,setter,opts],i)=>(
                    <select key={i} style={{...bi,fontSize:"11px",marginBottom:"4px"}} value={val} onChange={e=>setter(e.target.value)}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                  ))}
                  <textarea style={{...bi,resize:"vertical",minHeight:"42px",marginBottom:"6px"}} placeholder="Raw prompt (optional)..." value={pfRaw} onChange={e=>setPfRaw(e.target.value)}/>
                  <div style={{display:"flex",gap:"6px"}}>
                    <button style={Btn(T.pink,pfBusy)} onClick={handleForge} disabled={pfBusy}>{pfBusy?"FORGING...":"FORGE"}</button>
                    {pfOut&&<button style={Btn(T.cyan)} onClick={()=>{setGoal(pfOut);setForgeOpen(false);}}>→ LOAD</button>}
                  </div>
                  {pfOut&&<div style={{marginTop:"8px",color:"#ff9ed2",fontSize:"11px",lineHeight:1.5,background:"#0d0817",padding:"8px",border:"1px solid #3a1040",whiteSpace:"pre-wrap",maxHeight:"80px",overflowY:"auto"}}>{pfOut}{pfBusy&&"▋"}</div>}
                </div>
              )}
              <div style={sec}>Goal</div>
              <textarea style={{...bi,resize:"vertical",minHeight:"72px"}} placeholder="Describe your goal..." value={goal} onChange={e=>setGoal(e.target.value)}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px",marginTop:"5px"}}>
                <div><div style={lbl}>Branch</div><input style={{...bi,padding:"5px 8px",fontSize:"11px"}} value={branch} onChange={e=>setBranch(e.target.value)} placeholder="main"/></div>
                <div><div style={lbl}>Commit</div><input style={{...bi,padding:"5px 8px",fontSize:"11px"}} value={commitMsg} onChange={e=>setCommitMsg(e.target.value)} placeholder="Optional..."/></div>
              </div>
              {goal.trim()&&<div style={{background:T.bg3,border:`1px solid ${T.border}`,padding:"6px 10px",marginTop:"6px",display:"flex",justifyContent:"space-between"}}><span style={{color:T.muted,fontSize:"10px"}}>EST. COST</span><span style={{color:T.yellow,fontSize:"11px"}}>~$0.02–0.04</span></div>}
              <div style={{display:"flex",gap:"5px",marginTop:"8px",flexWrap:"wrap"}}>
                <button style={Btn(isGated?T.purple:T.cyan,running||(!isGated&&(!goal.trim()||(!apiKey&&!proxyUrl))))} onClick={isGated?()=>setShowUpg(true):handleRun} disabled={running||(!isGated&&(!goal.trim()||(!apiKey&&!proxyUrl)))}>
                  {isGated?"↑ UPGRADE":running?"RUNNING...":"▶ DISPATCH"}
                </button>
                {running&&<button style={Btn(T.orange)} onClick={()=>{abortRef.current=true;setRunning(false);setPhase("idle");}}>ABORT</button>}
                {phase==="done"&&<button style={Btn(T.dim)} onClick={()=>{setAgOut({});setOverseer("");setLogs([]);setPhase("idle");setSbStatus("");setRunCost(0);}}>RESET</button>}
                {phase==="done"&&<button style={{...Btn(T.pink),padding:"8px 10px",fontSize:"10px"}} onClick={()=>setSaveOpen(true)}>+TPL</button>}
              </div>
              <div style={sec}>Agents</div>
              {Object.entries(AGENTS).map(([name,ag])=>{
                const out=agOut[name];
                return (
                  <div key={name} style={{display:"flex",alignItems:"center",gap:"5px",padding:"3px 0",borderBottom:"1px solid #0f1520"}}>
                    <span style={Dot(out?.status||"idle")}/>
                    <span style={{color:ag.c,fontSize:"10px",flex:1}}>{ag.i} {name}</span>
                    <span style={{color:T.dim,fontSize:"10px"}}>{out?.status||"—"}</span>
                  </div>
                );
              })}
              {logs.length>0&&(<><div style={sec}>Log</div><div style={{maxHeight:"80px",overflowY:"auto"}}>{logs.map((l,i)=><div key={i} style={{color:T.dim,fontSize:"10px",fontStyle:"italic"}}>{l}</div>)}</div></>)}
            </div>
            <div>
              {Object.keys(agOut).length===0&&phase==="idle"&&(
                <div style={{border:`1px dashed ${T.border2}`,padding:"48px",textAlign:"center"}}>
                  <div style={{fontSize:"36px",opacity:.1,marginBottom:"10px"}}>⬡</div>
                  <div style={{color:T.muted,letterSpacing:"3px",fontSize:"11px"}}>SWARM DORMANT</div>
                  <div style={{color:T.dim,fontSize:"11px",marginTop:"6px"}}>Enter a goal → ▶ Dispatch</div>
                  {sbUrl&&sbKey&&<div style={{color:"#3ecf8e",fontSize:"10px",marginTop:"8px"}}>⚡ Supabase connected</div>}
                </div>
              )}
              {Object.keys(agOut).map(name=><AgentCard key={name} name={name} out={agOut[name]}/>)}
              {(overseer||phase==="overseeing")&&(
                <div style={{border:`1px solid ${T.purple}`,background:"#0d0815",padding:"12px",marginTop:"8px",boxShadow:`0 0 12px ${T.purple}22`}}>
                  <div style={{color:T.purple,fontSize:"11px",letterSpacing:"3px",marginBottom:"8px"}}>◈ OVERSEER EVALUATION</div>
                  <div style={{color:"#8af",fontSize:"12px",lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:"200px",overflowY:"auto"}}>{overseer}{phase==="overseeing"&&"▋"}</div>
                </div>
              )}
              {phase==="done"&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"10px"}}>
                  <div style={{color:T.green,fontSize:"11px",letterSpacing:"2px"}}>✓ COMPLETE {sbStatus==="saved"?"· SAVED ✓":sbStatus==="saving"?"· SAVING...":sbStatus==="error"?"· ERR":sbStatus==="nosupa"?"· (no db)":""}</div>
                  <div style={{color:T.yellow,fontSize:"11px"}}>⚡ ${runCost.toFixed(5)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MARKETPLACE ── */}
        {tab==="templates"&&(
          <div>
            <div style={{display:"flex",gap:"7px",marginBottom:"14px",alignItems:"center",flexWrap:"wrap"}}>
              <input style={{...bi,width:"170px",padding:"6px 9px"}} placeholder="Search..." value={mktSearch} onChange={e=>setMktSearch(e.target.value)}/>
              <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                {CATS.map(c=><button key={c} onClick={()=>setMktCat(c)} style={{background:mktCat===c?`${T.cyan}18`:"transparent",border:`1px solid ${mktCat===c?T.cyan:T.border}`,color:mktCat===c?T.cyan:T.muted,padding:"4px 9px",fontFamily:"inherit",fontSize:"10px",cursor:"pointer"}}>{c}</button>)}
              </div>
              <select style={{...bi,width:"108px",padding:"5px 7px",fontSize:"10px",marginLeft:"auto"}} value={mktSort} onChange={e=>setMktSort(e.target.value)}>{SORTS.map(s=><option key={s}>{s}</option>)}</select>
              <span style={{color:T.muted,fontSize:"10px"}}>{filteredTpls.length}</span>
              {phase==="done"&&<button style={{...Btn(T.pink),padding:"5px 10px",fontSize:"10px"}} onClick={()=>setSaveOpen(true)}>+ PUBLISH</button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:"10px",marginBottom:"20px"}}>
              {filteredTpls.map(t=>(
                <TplCard key={t.id} t={t} canUse={t.price===0||purchased.has(t.id)}
                  onUse={()=>handlePurchase(t)}
                  onFork={()=>{setGoal(t.goal||"");setTplName(t.name+" (fork)");setTplDesc("Forked from: "+t.name);setTplCat(t.cat||"Other");setForkedFrom(t.name);setTab("swarm");}}
                />
              ))}
              {filteredTpls.length===0&&<div style={{gridColumn:"1/-1",color:T.dim,fontSize:"11px",padding:"40px",textAlign:"center",border:`1px dashed ${T.border2}`}}>No templates match.</div>}
            </div>
            {savedTpls.length>0&&(
              <div>
                <div style={sec}>My Local Templates</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:"10px"}}>
                  {savedTpls.map(t=>(
                    <div key={t.id} style={{border:`1px solid ${T.cyan}44`,background:T.bg2,padding:"13px"}}>
                      <div style={{color:T.cyan,fontWeight:"bold",marginBottom:"5px",fontSize:"12px"}}>{t.name}</div>
                      <div style={{color:T.muted,fontSize:"10px",marginBottom:"9px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.goal.slice(0,52)}</div>
                      <div style={{display:"flex",gap:"5px"}}>
                        <button style={{...Btn(T.cyan),padding:"4px 0",fontSize:"10px",flex:1}} onClick={()=>{setGoal(t.goal);setTab("swarm");}}>USE</button>
                        <button style={{...Btn(T.orange),padding:"4px 7px",fontSize:"10px"}} onClick={()=>setSavedTpls(p=>p.filter(x=>x.id!==t.id))}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {saveOpen&&<PublishModal goal={goal} tplName={tplName} setTplName={setTplName} tplDesc={tplDesc} setTplDesc={setTplDesc} tplCat={tplCat} setTplCat={setTplCat} tplPrice={tplPrice} setTplPrice={setTplPrice} tplTags={tplTags} setTplTags={setTplTags} onPublish={handlePublish} onClose={()=>setSaveOpen(false)}/>}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab==="history"&&(
          <div>
            {(!sbUrl||!sbKey)&&(
              <div style={{border:"1px solid #0d2a1e",background:"#090f0c",padding:"12px",marginBottom:"12px",maxWidth:"440px"}}>
                <div style={{color:"#3ecf8e",fontSize:"11px",letterSpacing:"2px",marginBottom:"8px"}}>⚡ SUPABASE REQUIRED</div>
                <input style={{...bi,marginBottom:"6px"}} placeholder="Project URL" value={sbUrl} onChange={e=>setSbUrl(e.target.value)}/>
                <input style={bi} type="password" placeholder="Anon key" value={sbKey} onChange={e=>setSbKey(e.target.value)}/>
                <button style={{...Btn("#3ecf8e"),marginTop:"8px"}} onClick={loadRuns}>CONNECT</button>
              </div>
            )}
            {diffA&&diffB&&<DiffView a={diffA} b={diffB} onClose={()=>{setDiffA(null);setDiffB(null);setPickDiff(false);}}/>}
            <div style={{display:"flex",gap:"7px",marginBottom:"12px",alignItems:"center",flexWrap:"wrap"}}>
              <button style={Btn("#3ecf8e",runsLoading)} onClick={loadRuns} disabled={runsLoading}>{runsLoading?"LOADING...":"↺ REFRESH"}</button>
              {pickDiff
                ?<div style={{color:T.yellow,fontSize:"11px"}}>SELECT {diffA?"2ND":"1ST"} RUN ·&nbsp;<button onClick={()=>{setPickDiff(false);setDiffA(null);setDiffB(null);}} style={{background:"none",border:"none",color:T.orange,cursor:"pointer",fontFamily:"inherit",fontSize:"11px"}}>cancel</button></div>
                :<button style={{...Btn(T.cyan),padding:"5px 11px",fontSize:"10px"}} onClick={()=>setPickDiff(true)}>⟷ DIFF</button>
              }
              <select style={{...bi,width:"115px",padding:"5px 7px",fontSize:"11px"}} value={brFilter} onChange={e=>setBrFilter(e.target.value)}>{branches.map(b=><option key={b}>{b}</option>)}</select>
              <span style={{color:T.muted,fontSize:"11px"}}>{runs.length} runs</span>
            </div>
            {viewRun?(
              <div>
                <button style={{...Btn(T.dim),marginBottom:"12px",padding:"5px 11px"}} onClick={()=>setViewRun(null)}>← BACK</button>
                <div style={{color:T.cyan,fontSize:"12px",marginBottom:"3px"}}>{(viewRun.goal||"").slice(0,80)}</div>
                <div style={{color:T.dim,fontSize:"10px",display:"flex",gap:"10px",marginBottom:"12px"}}>
                  <span>⎇ {viewRun.branch||"main"}</span>
                  <span>v{viewRun.version_num||"?"}</span>
                  {viewRun.score&&<span style={{color:T.green}}>★ {viewRun.score}</span>}
                  {viewRun.cost&&<span style={{color:T.yellow}}>⚡${parseFloat(viewRun.cost).toFixed(5)}</span>}
                  <span>{new Date(viewRun.created_at).toLocaleString()}</span>
                </div>
                {Object.entries(viewRun.agents||{}).map(([name,out])=><AgentCard key={name} name={name} out={out}/>)}
                {viewRun.overseer&&(
                  <div style={{border:`1px solid ${T.purple}`,background:"#0d0815",padding:"12px",marginTop:"8px"}}>
                    <div style={{color:T.purple,fontSize:"11px",letterSpacing:"3px",marginBottom:"8px"}}>◈ OVERSEER</div>
                    <div style={{color:"#8af",fontSize:"12px",lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:"200px",overflowY:"auto"}}>{viewRun.overseer}</div>
                  </div>
                )}
              </div>
            ):(
              <div>
                {filteredRuns.map(run=>(
                  <RunRow key={run.id} run={run} diffA={diffA} diffB={diffB} pickDiff={pickDiff}
                    onView={setViewRun} onBranch={branchFrom} onRestore={restoreRun} onDelete={deleteRun} onPickDiff={handlePickDiff}
                  />
                ))}
                {runs.length===0&&!runsLoading&&sbUrl&&sbKey&&<div style={{color:T.dim,fontSize:"11px",textAlign:"center",padding:"40px",border:`1px dashed ${T.border2}`}}>No runs yet.</div>}
              </div>
            )}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"14px"}}>
              {[{l:"TOTAL RUNS",v:runs.length,c:T.cyan},{l:"TODAY",v:today,c:T.green},{l:"AVG SCORE",v:scores.length?avgScore+"/10":"—",c:T.yellow},{l:"TOTAL COST",v:"$"+totalCost.toFixed(4),c:T.purple}].map(({l,v,c})=>(
                <div key={l} style={{border:`1px solid ${T.border}`,background:T.bg2,padding:"14px"}}>
                  <div style={{color:T.muted,fontSize:"10px",letterSpacing:"2px",marginBottom:"7px"}}>{l}</div>
                  <div style={{color:c,fontSize:"22px",fontWeight:"bold"}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
              <div style={{border:`1px solid ${T.border}`,background:T.bg2,padding:"14px"}}>
                <div style={{color:T.text,fontSize:"11px",letterSpacing:"2px",marginBottom:"10px"}}>AGENT USAGE</div>
                {Object.entries(agUsage).sort((a,b)=>b[1]-a[1]).map(([name,count])=>(
                  <div key={name} style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"4px"}}>
                    <div style={{color:AGENTS[name]?.c,fontSize:"9px",width:"78px"}}>{AGENTS[name]?.i} {name}</div>
                    <div style={{flex:1,height:"4px",background:T.bg3}}><div style={{height:"100%",width:`${(count/maxU)*100}%`,background:AGENTS[name]?.c||T.cyan}}/></div>
                    <div style={{color:T.muted,fontSize:"10px",width:"14px",textAlign:"right"}}>{count}</div>
                  </div>
                ))}
              </div>
              <div style={{border:`1px solid ${T.border}`,background:T.bg2,padding:"14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"10px"}}>
                  <div style={{color:T.text,fontSize:"11px",letterSpacing:"2px"}}>PLAN</div>
                  <div style={{color:plan==="pro"?T.purple:T.muted,fontSize:"11px"}}>{plan.toUpperCase()}</div>
                </div>
                {plan==="free"&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}><span style={{color:T.muted,fontSize:"10px"}}>Runs used</span><span style={{color:runCount>=FREE_LIMIT?T.orange:T.green,fontSize:"10px"}}>{runCount}/{FREE_LIMIT}</span></div>
                    <div style={{height:"4px",background:T.bg3,marginBottom:"14px"}}><div style={{height:"100%",width:`${Math.min(100,(runCount/FREE_LIMIT)*100)}%`,background:runCount>=FREE_LIMIT?T.orange:T.green}}/></div>
                    <button style={{...Btn(T.purple),width:"100%",marginBottom:"8px",fontSize:"10px"}} onClick={()=>setShowUpg(true)}>↑ UPGRADE TO PRO — $29/mo</button>
                  </div>
                )}
                {plan==="pro"&&<div style={{color:T.green,fontSize:"11px"}}>✓ Unlimited runs active</div>}
                <div style={{borderTop:`1px solid ${T.border}`,marginTop:"12px",paddingTop:"10px"}}>
                  <div style={{color:T.muted,fontSize:"10px",letterSpacing:"2px",marginBottom:"6px"}}>MIGRATION DDL</div>
                  <pre style={{background:T.bg3,padding:"7px",fontSize:"10px",color:"#3ecf8e",lineHeight:1.6,margin:0,overflowX:"auto"}}>{`alter table agent_runs
  add column if not exists branch text,
  add column if not exists version_num int,
  add column if not exists run_message text,
  add column if not exists user_email text,
  add column if not exists tokens_used int,
  add column if not exists cost numeric,
  add column if not exists is_template boolean,
  add column if not exists template_name text;`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showUpg&&<UpgradeModal used={runCount} sbUrl={sbUrl} jwt={jwt} onClose={()=>setShowUpg(false)} onPro={()=>{setPlan("pro");setShowUpg(false);}}/>}
      {showAuth&&<AuthModal sbUrl={sbUrl} sbKey={sbKey} onSession={s=>{setSession(s);setShowAuth(false);}} onSkip={()=>setShowAuth(false)}/>}
      <style>{`select option{background:#0d111a}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#090b10}::-webkit-scrollbar-thumb{background:#1e2840}input::placeholder,textarea::placeholder{color:#334}`}</style>
    </div>
    </>
  );
}
