const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const I=require('./i18n.js'),S=require('./session.js');
const LANGS=Object.keys(I.languages).filter(l=>l!=='it');
const vars=s=>(s.match(/\{\w+\}/g)||[]).sort().join();
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');

test('every message exists in every language with the same placeholders',()=>{
 for(const [key,row] of Object.entries(I.messages))for(const l of LANGS){
  assert.ok(row[l],`${key} / ${l}`);
  assert.equal(vars(row[l]),vars(key),`${key} / ${l}`);
 }
});
test('language resolution falls back to English and honours the saved choice',()=>{
 assert.equal(I.resolve('de-AT'),'de');assert.equal(I.resolve('ja-JP'),'en');assert.equal(I.resolve(''),'en');
 const store=v=>({getItem:()=>v});
 assert.equal(I.preferred(store('fr'),'de-DE'),'fr');
 assert.equal(I.preferred(store('xx'),'es-MX'),'es');
 assert.equal(I.preferred({getItem(){throw new Error('blocked');}},'it-IT'),'it');
});
test('translate fills parameters and keeps Italian as source',()=>{
 assert.equal(I.translate('Passo {n}','en',{n:3}),'Step 3');
 assert.equal(I.translate('Passo {n}','it',{n:3}),'Passo 3');
 assert.equal(I.translate('Cutoff','de'),'Cutoff');
});
test('all interface strings have a translation',()=>{
 for(const p of S.presets)assert.ok(I.messages[p.name],p.name);
 const app=read('app.js'),used=[...app.matchAll(/\b(?:tr|status)\((?:[^'()]*\?)?'([^']+)'/g)].map(x=>x[1]);
 assert.ok(used.length>=10,`found ${used.length}`);
 for(const k of used)assert.ok(I.messages[k],k);
 for(const k of ['Voce','Distorsione','Cassa','Uscita','Coda','Ott'])assert.ok(I.messages[k],k);
 for(const g of S.GATE_NAMES)assert.ok(I.messages[`gate ${g}`],g);
 const html=read('index.html').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<svg[\s\S]*?<\/svg>/g,'');
 const keep=new Set(['Kick 4/4','Lead','Rec','Cutoff','Reso','Env Mod','Decay','Play','Tempo','BPM','Swing','%','Preset','Wave','Saw','Square','Overdrive','Fuzz','Dist','Glitch','Stutter','ACIDO','Shift','Esc','play/stop,','Q','Z','X','1','8','/','–','◀','▶','A W S E D F T G Y H U J K','Italiano','English','Français','Deutsch','Español']);
 for(const raw of html.replace(/<head>[\s\S]*?<title>/,'<title>').split(/<[^>]+>/)){const s=raw.trim();if(s&&!keep.has(s))assert.ok(I.messages[s],s);}
});
