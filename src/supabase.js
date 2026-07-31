const trimUrl=url=>url.replace(/\/$/,"");

async function jsonOrThrow(res,errKey="message") {
  const d=await res.json();
  if(!res.ok)throw new Error(d[errKey]||`HTTP ${res.status}`);
  return d;
}

export function mkDb(url,key) {
  const base=trimUrl(url);
  const h={"Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${key}`};
  return {
    async ins(t,row){return jsonOrThrow(await fetch(`${base}/rest/v1/${t}`,{method:"POST",headers:{...h,"Prefer":"return=representation"},body:JSON.stringify(row)}));},
    async sel(t,q=""){return jsonOrThrow(await fetch(`${base}/rest/v1/${t}?${q}`,{headers:h}));},
    async del(t,id){await fetch(`${base}/rest/v1/${t}?id=eq.${id}`,{method:"DELETE",headers:h});},
  };
}

export function mkAuth(url,key) {
  const base=trimUrl(url);const h={"Content-Type":"application/json","apikey":key};
  const post=async(path,email,password)=>jsonOrThrow(
    await fetch(`${base}${path}`,{method:"POST",headers:h,body:JSON.stringify({email,password})}),
    "error_description",
  );
  return {
    signIn:(e,p)=>post("/auth/v1/token?grant_type=password",e,p),
    signUp:(e,p)=>post("/auth/v1/signup",e,p),
  };
}

// Calls a Supabase Edge Function and returns its JSON body.
export async function callFunction(url,name,jwt,body) {
  const res=await fetch(`${trimUrl(url)}/functions/v1/${name}`,{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${jwt}`},
    body:JSON.stringify(body),
  });
  const ct=res.headers.get("content-type")||"";
  if(!ct.includes("json"))throw new Error(`${name} not deployed yet (HTTP ${res.status})`);
  const d=await res.json();
  if(d.error)throw new Error(d.error);
  return d;
}
