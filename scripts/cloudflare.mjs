// Cloudflare REST operations use the existing Wrangler OAuth credential; never print it.
import fs from 'node:fs';import os from 'node:os';
const account='de623dd659f63579a4656ab3a8ada602';
const config=fs.readFileSync(`${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`,'utf8');const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw new Error('Wrangler login required');
const path=process.argv[2],method=process.argv[3]??'GET',file=process.argv[4];
const response=await fetch(`https://api.cloudflare.com/client/v4/${path.replace('{account}',account)}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(file?{body:fs.readFileSync(file,'utf8')}:{})});
const data=await response.json();if(!response.ok||!data.success){console.error(JSON.stringify({status:response.status,errors:data.errors}));process.exit(1);}
// Settings may include secret bindings: redact all values except known plain vars.
function redact(v){if(Array.isArray(v))return v.map(redact);if(v&&typeof v==='object'){return Object.fromEntries(Object.entries(v).map(([k,val])=>[k,/token|secret|password|private_key/i.test(k)&&k!=='secret_name'?'[redacted]':redact(val)]));}return v;}
console.log(JSON.stringify(redact(data.result),null,2));
