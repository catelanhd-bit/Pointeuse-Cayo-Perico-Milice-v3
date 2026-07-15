const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RATE = 12500;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CayoAdmin2026!';
const DB_FILE = path.join(__dirname, 'db.json');

const emptyDb = () => ({ requests: [], members: [], entries: [], payments: [] });
function loadDb(){
  if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb(), null, 2));
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { const db = emptyDb(); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); return db; }
}
function saveDb(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function norm(v){ return String(v || '').trim().replace(/\s+/g,' ').toLowerCase(); }
function duration(e){ return Math.max(0, (e.end ? new Date(e.end) : new Date()) - new Date(e.start)); }
function bonus(ms){ return Math.round(ms / 3600000 * RATE); }
function weekStart(){
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  return d;
}
function memberByDevice(db, token){
  return db.members.find(m => m.active && Array.isArray(m.deviceTokens) && m.deviceTokens.includes(token));
}
function adminOnly(req,res,next){
  if(!req.session.admin) return res.status(403).json({error:'Accès administrateur requis.'});
  next();
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-cayo-secret',
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',maxAge:43200000}
}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/health',(req,res)=>res.json({ok:true,version:'finale'}));

app.post('/api/request-access',(req,res)=>{
  const {firstName,lastName,phone='',message='',deviceToken=''} = req.body || {};
  if(!firstName || !lastName || !deviceToken) return res.status(400).json({error:'Prénom, nom RP et appareil obligatoires.'});
  const db = loadDb();
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g,' ');
  if(db.requests.some(r => r.status === 'pending' && (norm(r.fullName) === norm(fullName) || r.deviceToken === deviceToken)))
    return res.status(400).json({error:'Une demande est déjà en attente.'});
  if(db.members.some(m => m.active && (norm(m.fullName) === norm(fullName) || (m.deviceTokens || []).includes(deviceToken))))
    return res.status(400).json({error:'Cet accès est déjà validé.'});
  db.requests.push({id:Date.now(),fullName,phone,message,deviceToken,status:'pending',createdAt:new Date().toISOString()});
  saveDb(db);
  res.json({ok:true});
});

app.post('/api/member/automatic-connect',(req,res)=>{
  const db = loadDb();
  const member = memberByDevice(db, req.body?.deviceToken);
  if(!member) return res.status(401).json({error:'Appareil non autorisé.'});
  res.json({member});
});

app.post('/api/member/dashboard',(req,res)=>{
  const db = loadDb();
  const member = memberByDevice(db, req.body?.deviceToken);
  if(!member) return res.status(401).json({error:'Accès invalide ou désactivé.'});
  const entries = db.entries.filter(e=>e.memberId===member.id).sort((a,b)=>new Date(b.start)-new Date(a.start));
  const done = entries.filter(e=>e.end);
  const active = entries.find(e=>!e.end) || null;
  const now = new Date();
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const month = new Date(now.getFullYear(),now.getMonth(),1);
  const week = weekStart();
  const sum = d => done.filter(e=>new Date(e.start)>=d).reduce((s,e)=>s+duration(e),0);
  const weeklyWallet = done.filter(e=>new Date(e.start)>=week && !db.payments.some(p=>p.entryId===e.id)).reduce((s,e)=>s+bonus(duration(e)),0);
  res.json({
    member:{id:member.id,fullName:member.fullName,grade:member.grade,division:member.division},
    active,
    stats:{today:sum(today),week:sum(week),month:sum(month),weeklyWallet},
    entries:entries.map(e=>({...e,duration:duration(e),bonus:bonus(duration(e)),paid:db.payments.some(p=>p.entryId===e.id)}))
  });
});

app.post('/api/member/clock-in',(req,res)=>{
  const db = loadDb();
  const member = memberByDevice(db, req.body?.deviceToken);
  if(!member) return res.status(401).json({error:'Accès invalide.'});
  if(db.entries.some(e=>e.memberId===member.id && !e.end)) return res.status(400).json({error:'Service déjà en cours.'});
  db.entries.push({id:Date.now(),memberId:member.id,start:new Date().toISOString(),end:null});
  saveDb(db); res.json({ok:true});
});
app.post('/api/member/clock-out',(req,res)=>{
  const db = loadDb();
  const member = memberByDevice(db, req.body?.deviceToken);
  if(!member) return res.status(401).json({error:'Accès invalide.'});
  const entry = db.entries.find(e=>e.memberId===member.id && !e.end);
  if(!entry) return res.status(400).json({error:'Aucun service en cours.'});
  entry.end = new Date().toISOString();
  saveDb(db); res.json({ok:true,bonus:bonus(duration(entry))});
});

app.post('/api/admin/login',(req,res)=>{
  if(req.body?.password !== ADMIN_PASSWORD) return res.status(401).json({error:'Mot de passe incorrect.'});
  req.session.admin = true; res.json({ok:true});
});
app.post('/api/admin/logout',(req,res)=>{req.session.admin=false;res.json({ok:true});});
app.get('/api/admin/status',(req,res)=>res.json({admin:!!req.session.admin}));

app.get('/api/admin/data',adminOnly,(req,res)=>{
  const db = loadDb();
  const start = weekStart();
  const members = db.members.map(m=>{
    const weeklyWallet = db.entries.filter(e=>e.memberId===m.id && e.end && new Date(e.start)>=start && !db.payments.some(p=>p.entryId===e.id)).reduce((s,e)=>s+bonus(duration(e)),0);
    return {...m,weeklyWallet};
  });
  const entries = db.entries.map(e=>{
    const m = db.members.find(x=>x.id===e.memberId);
    return {...e,memberName:m?.fullName||'Membre supprimé',duration:duration(e),bonus:bonus(duration(e)),paid:db.payments.some(p=>p.entryId===e.id)};
  }).sort((a,b)=>new Date(b.start)-new Date(a.start));
  res.json({requests:db.requests.filter(r=>r.status==='pending'),members,entries});
});

app.post('/api/admin/request/:id/approve',adminOnly,(req,res)=>{
  const db = loadDb();
  const r = db.requests.find(x=>x.id===Number(req.params.id) && x.status==='pending');
  if(!r) return res.status(404).json({error:'Demande introuvable.'});
  db.members.push({id:Date.now(),fullName:r.fullName,grade:req.body?.grade||'Milicien',division:req.body?.division||'Générale',active:true,deviceTokens:[r.deviceToken],createdAt:new Date().toISOString()});
  r.status='approved'; r.reviewedAt=new Date().toISOString();
  saveDb(db); res.json({ok:true});
});
app.post('/api/admin/request/:id/reject',adminOnly,(req,res)=>{
  const db=loadDb(); const r=db.requests.find(x=>x.id===Number(req.params.id));
  if(!r) return res.status(404).json({error:'Demande introuvable.'});
  r.status='rejected'; saveDb(db); res.json({ok:true});
});
app.put('/api/admin/member/:id',adminOnly,(req,res)=>{
  const db=loadDb(); const m=db.members.find(x=>x.id===Number(req.params.id));
  if(!m) return res.status(404).json({error:'Membre introuvable.'});
  if(typeof req.body?.active==='boolean') m.active=req.body.active;
  saveDb(db); res.json({ok:true});
});
app.delete('/api/admin/member/:id',adminOnly,(req,res)=>{
  const db=loadDb(), id=Number(req.params.id), ids=db.entries.filter(e=>e.memberId===id).map(e=>e.id);
  db.members=db.members.filter(m=>m.id!==id);
  db.entries=db.entries.filter(e=>e.memberId!==id);
  db.payments=db.payments.filter(p=>!ids.includes(p.entryId));
  saveDb(db); res.json({ok:true});
});
app.post('/api/admin/member/:id/pay-week',adminOnly,(req,res)=>{
  const db=loadDb(), id=Number(req.params.id), start=weekStart();
  if(!db.members.some(m=>m.id===id)) return res.status(404).json({error:'Membre introuvable.'});
  const list=db.entries.filter(e=>e.memberId===id && e.end && new Date(e.start)>=start && !db.payments.some(p=>p.entryId===e.id));
  const total=list.reduce((s,e)=>s+bonus(duration(e)),0), paidAt=new Date().toISOString();
  list.forEach((e,i)=>db.payments.push({id:Date.now()+i,entryId:e.id,memberId:id,amount:bonus(duration(e)),paidAt,paymentType:'weekly'}));
  saveDb(db); res.json({ok:true,totalAmount:total,entriesPaid:list.length});
});
app.delete('/api/admin/entry/:id',adminOnly,(req,res)=>{
  const db=loadDb(), id=Number(req.params.id);
  db.entries=db.entries.filter(e=>e.id!==id);
  db.payments=db.payments.filter(p=>p.entryId!==id);
  saveDb(db); res.json({ok:true});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log('Pointeuse Cayo Perico sur le port '+PORT));
