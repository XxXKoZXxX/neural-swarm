// PostgREST calls carry the session JWT so they run as the signed-in user and
// RLS applies; the anon key stays in `apikey` where it belongs.
export function mkDb(url,key,jwt) {
  const base=url.replace(/\/$/,"");
  const h={"Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${jwt||key}`};
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

// Calls the stripe-checkout function with the caller's session, so the purchase
// is attributed to their account. Returns the parsed response, throws on a
// non-JSON body (function not deployed) or a reported error.
export async function startCheckout(url,jwt,body,notDeployed=s=>`stripe-checkout not deployed yet (HTTP ${s})`) {
  const res=await fetch(`${url.replace(/\/$/,"")}/functions/v1/stripe-checkout`,{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${jwt}`},
    body:JSON.stringify(body),
  });
  const ct=res.headers.get("content-type")||"";
  if(!ct.includes("json"))throw new Error(notDeployed(res.status));
  const d=await res.json();
  if(d.error)throw new Error(d.error);
  return d;
}
