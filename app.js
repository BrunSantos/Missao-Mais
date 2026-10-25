import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,query,where,updateDoc,deleteDoc,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,ADMIN_UID} from './firebase-settings-v3.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').trim().toLowerCase();
let user=null,profile=null,people=[],invites=[],tasks=[],claims=[],tab='inicio';
const isAdmin=()=>user?.uid===ADMIN_UID;
const notice=s=>{$('feedback').textContent=s};
const personName=id=>people.find(p=>p.uid===id)?.name||'Conta pendente';
const associated=id=>isAdmin()||(profile?.role==='guardian'&&profile?.status==='active'&&(people.some(p=>p.uid===id&&p.role==='child'&&(p.guardianIds||[]).includes(user.uid))));
const myKids=()=>people.filter(p=>p.role==='child'&&p.status==='active'&&(isAdmin()||(p.guardianIds||[]).includes(user.uid)));
const score=id=>claims.filter(c=>c.childId===id&&c.status==='approved').reduce((n,c)=>n+Number(c.points||0),0);
const isoDay=d=>d.toISOString().slice(0,10);
function period(t){const d=new Date(),start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));if(t.frequency==='weekly')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);return t.frequency==='once'?{key:'once',start:null}:{key:isoDay(start),start};}
const taskTitle=id=>tasks.find(t=>t.id===id)?.title||'Tarefa';

async function load(){
  const snap=await getDoc(doc(db,'profiles',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:null;
  if(isAdmin()){
    const [p,i]=await Promise.all([getDocs(collection(db,'profiles')),getDocs(collection(db,'invitations'))]);
    people=p.docs.map(d=>({uid:d.id,...d.data()}));invites=i.docs.map(d=>({email:d.id,...d.data()}));
  }else if(profile?.role==='guardian'&&profile?.status==='active'){
    const q=await getDocs(query(collection(db,'profiles'),where('guardianIds','array-contains',user.uid)));
    people=[profile,...q.docs.map(d=>({uid:d.id,...d.data()}))];invites=[];
  }else{people=profile?[profile]:[];invites=[];}
  const ids=isAdmin()?[]:profile?.role==='child'?[user.uid]:myKids().map(p=>p.uid);
  const fetch=async col=>isAdmin()?(await getDocs(collection(db,col))).docs.map(d=>({id:d.id,...d.data()})):(await Promise.all(ids.map(id=>getDocs(query(collection(db,col),where('childId','==',id)))))).flatMap(q=>q.docs.map(d=>({id:d.id,...d.data()})));
  tasks=await fetch('tasks');claims=await fetch('claims');
}
async function bootstrap(){
  if(isAdmin()){
    const ref=doc(db,'profiles',user.uid),snap=await getDoc(ref);
    if(!snap.exists())await setDoc(ref,{name:user.email, email:normalize(user.email),role:'admin',status:'active',guardianIds:[],balance:0,createdAt:serverTimestamp()});
    return;
  }
  const email=normalize(user.email),ref=doc(db,'profiles',user.uid);
  if((await getDoc(ref)).exists())return;
  const invitation=await getDoc(doc(db,'invitations',email));
  if(!invitation.exists())return;
  const inv=invitation.data();
  await setDoc(ref,{name:inv.name,email,role:inv.role,status:'pending',guardianIds:inv.role==='child'?(inv.guardianIds||[]):[],balance:0,createdAt:serverTimestamp()});
}
function render(){
 $('login').hidden=!!user;$('workspace').hidden=!user;$('logout').hidden=!user;
 if(!user)return;
 $('identity').textContent=profile?.name||user.email;
 const allowed=isAdmin()?['inicio','pessoas','tarefas','aprovações','recompensas']:profile?.status==='active'&&profile?.role==='guardian'?['inicio','tarefas','aprovações']:profile?.status==='active'&&profile?.role==='child'?['inicio','tarefas']:['inicio'];
 if(!allowed.includes(tab))tab='inicio';
 $('tabs').innerHTML=allowed.map(t=>`<button class="${tab===t?'':'alt'}" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('');
 $('screen').innerHTML=tab==='pessoas'?members():tab==='inicio'?home():tab==='tarefas'?taskScreen():tab==='aprovações'?approvalScreen():`<h2>Recompensas</h2><p class="muted">Em preparação. Os pontos ainda não podem ser descontados.</p>`;
}
function home(){
 if(!isAdmin())return `<h2>Bem-vindo à Missão+</h2><p>${!profile?'Ainda não existe um convite para este email. Pede ao administrador que te adicione.':profile.status==='pending'?'A tua conta foi criada. Aguarda a autorização do administrador.':profile.role==='guardian'?'Conta de encarregado ativa. Já podes criar e aprovar tarefas dos filhos associados.':'Conta de filho ativa. Já podes consultar e submeter as tuas missões.'}</p>${profile?.role==='child'?`<div class="points">${score(user.uid)} ⭐ pontos aprovados</div>`:''}${profile?.role==='guardian'?`<div class="grid">${myKids().map(k=>`<article class="card"><h3>${esc(k.name)}</h3><div class="points">${score(k.uid)} ⭐</div></article>`).join('')}</div>`:''}`;
 const guardians=people.filter(p=>p.role==='guardian'),children=people.filter(p=>p.role==='child');
 return `<h2>O teu painel</h2><div class="grid"><article class="card"><h3>Encarregados</h3><div class="points">${guardians.length}</div></article><article class="card"><h3>Filhos</h3><div class="points">${children.length}</div></article><article class="card"><h3>Contas por autorizar</h3><div class="points">${people.filter(p=>p.status==='pending').length}</div></article></div><p>Em <b>Pessoas</b> geres as associações. Em <b>Tarefas</b> crias missões e em <b>Aprovações</b> validas os pontos.</p>`;
}
function members(){
 const guardians=people.filter(p=>p.role==='guardian'&&p.status==='active');
 const children=people.filter(p=>p.role==='child');
 const childOptions=guardians.map(g=>`<label class="check"><input type="checkbox" name="guardian" value="${esc(g.uid)}"> ${esc(g.name)} (${esc(g.email)})</label>`).join('');
 const invitations=invites.map(i=>`<article class="item"><div><b>${esc(i.name)}</b><p class="muted">${esc(i.email)} · ${i.role==='guardian'?'Encarregado':'Filho'} · Convite criado</p></div><button class="alt" data-action="deleteInvite" data-id="${esc(i.email)}">Remover convite</button></article>`).join('');
 const accounts=people.filter(p=>p.uid!==ADMIN_UID).map(p=>`<article class="item"><div><b>${esc(p.name)}</b><p class="muted">${esc(p.email)} · ${p.role==='guardian'?'Encarregado':'Filho'} · ${p.status==='active'?'Ativo':'Aguarda aprovação'}</p>${p.role==='child'?`<p class="muted">Encarregados: ${(p.guardianIds||[]).map(id=>esc(personName(id))).join(', ')||'Nenhum'}</p>`:''}</div>${p.status==='pending'?`<button data-action="approve" data-id="${esc(p.uid)}">Autorizar</button>`:''}</article>`).join('');
 return `<h2>Gestão da família</h2><p class="muted">Só o administrador pode convidar e autorizar contas. Os convidados criam a própria password. Não é necessário copiar UID do Firebase.</p>
 <div class="grid"><article class="card"><h3>1. Adicionar encarregado</h3><form id="guardianForm"><label>Nome<input name="name" required maxlength="100"></label><label>Email<input name="email" type="email" required></label><button>Criar convite</button></form></article>
 <article class="card"><h3>2. Adicionar filho</h3>${guardians.length?`<form id="childForm"><label>Nome<input name="name" required maxlength="100"></label><label>Email para iniciar sessão<input name="email" type="email" required></label><fieldset><legend>Associar aos encarregados ativos</legend>${childOptions}</fieldset><button>Criar convite do filho</button></form>`:'<p>Autoriza primeiro pelo menos um encarregado de educação.</p>'}</article></div>
 <article class="card"><h3>Convites</h3>${invitations||'<p class="muted">Ainda não existem convites.</p>'}<p class="muted">Partilha com cada pessoa o endereço da Missão+ e pede-lhe que clique em «Criar conta» com o email convidado. O convite não envia emails automaticamente.</p></article>
 <article class="card"><h3>Utilizadores registados</h3>${accounts||'<p class="muted">Ainda não existem utilizadores.</p>'}</article>`;
}
function taskScreen(){
 const adult=isAdmin()||profile?.role==='guardian',kids=myKids();
 const form=adult?`<article class="card"><h3>Nova tarefa</h3><form id="taskForm"><label>Nome da tarefa<input name="title" required maxlength="120" placeholder="Ex.: Preparar a mochila"></label><label>Descrição<textarea name="description" maxlength="600"></textarea></label><label>Tipo<select name="category"><option value="Responsabilidade">Responsabilidade diária</option><option value="Tarefa doméstica">Tarefa doméstica</option></select></label><label>Período<select name="period"><option>Manhã</option><option>Depois da escola</option><option>Noite</option><option>Outro</option></select></label><label>Pontos<input name="points" type="number" min="1" max="500" required value="10"></label><label>Frequência<select name="frequency"><option value="daily">Diária (uma vez por dia UTC)</option><option value="weekly">Semanal (uma vez por semana UTC)</option><option value="once">Pontual (uma vez)</option></select></label><label>Hora limite (opcional)<input name="deadline" type="time"></label><fieldset><legend>Filhos associados</legend>${kids.map(k=>`<label class="check"><input type="checkbox" name="child" value="${esc(k.uid)}">${esc(k.name)}</label>`).join('')||'<p>Primeiro associa um filho ativo.</p>'}</fieldset><button>Criar tarefa</button></form></article>`:'';
 const visible=tasks.filter(t=>adult?kids.some(k=>k.uid===t.childId):t.childId===user.uid);
 return `<h2>Tarefas e responsabilidades</h2><p class="muted">Os pontos só contam depois da aprovação. As tarefas são individuais, mesmo quando atribuídas a vários filhos.</p>${form}<div class="grid">${visible.map(t=>{const per=period(t),claim=claims.find(c=>c.taskId===t.id&&c.childId===t.childId&&c.periodKey===per.key);return `<article class="card"><div class="row"><h3>${esc(t.title)}</h3><span class="pill">${Number(t.points)} ⭐</span></div><p>${esc(t.description||'')}</p><p class="muted">${esc(t.category)} · ${esc(t.period)} · ${esc(t.frequency==='daily'?'Diária':t.frequency==='weekly'?'Semanal':'Pontual')}${t.deadline?' · até '+esc(t.deadline):''}</p>${adult?`<p>Para: ${esc(personName(t.childId))}</p>`:`<p>${claim?'Estado: '+(claim.status==='pending'?'A aguardar aprovação':claim.status==='approved'?'Aprovada':'Rejeitada — podes tentar novamente'):'Ainda não submetida'}</p>${!claim||claim.status==='rejected'?`<button data-action="submitTask" data-id="${esc(t.id)}">Marcar como concluída</button>`:''}`}</article>`}).join('')||'<p>Ainda não existem tarefas.</p>'}</div>`;
}
function approvalScreen(){
 if(!(isAdmin()||profile?.role==='guardian'))return '<p>Sem acesso.</p>';
 const pending=claims.filter(c=>c.status==='pending'&&myKids().some(k=>k.uid===c.childId));
 return `<h2>Aprovar tarefas</h2><p class="muted">Só a aprovação adiciona pontos ao total do filho.</p><div class="grid">${pending.map(c=>`<article class="card"><h3>${esc(taskTitle(c.taskId))}</h3><p>${esc(personName(c.childId))} · ${Number(c.points)} ⭐</p><div class="login-actions"><button data-action="approveClaim" data-id="${esc(c.id)}">Aprovar</button><button class="red" data-action="rejectClaim" data-id="${esc(c.id)}">Rejeitar</button></div></article>`).join('')||'<p>Não há tarefas pendentes.</p>'}</div>`;
}
async function createTask(form){
 if(!(isAdmin()||profile?.role==='guardian'))throw Error('Sem autorização.');
 const f=new FormData(form),ids=f.getAll('child'),points=Number(f.get('points'));
 if(!ids.length||ids.some(id=>!myKids().some(k=>k.uid===id)))throw Error('Seleciona filhos associados e ativos.');
 if(!Number.isInteger(points)||points<1||points>500)throw Error('Pontos inválidos.');
 const title=String(f.get('title')||'').trim();if(!title)throw Error('Indica o nome da tarefa.');
 for(const childId of ids){const ref=doc(collection(db,'tasks'));await setDoc(ref,{title,description:String(f.get('description')||'').trim(),category:f.get('category'),period:f.get('period'),points,frequency:f.get('frequency'),deadline:f.get('deadline'),childId,createdBy:user.uid,createdAt:serverTimestamp()});}
 await load();render();notice('Tarefa criada.');
}
async function taskAction(action,id){
 if(action==='submitTask'){
   const t=tasks.find(t=>t.id===id);if(!t||profile?.role!=='child'||t.childId!==user.uid)throw Error('Tarefa não disponível.');
   const p=period(t),claimId=`${id}_${user.uid}_${p.key}`,ref=doc(db,'claims',claimId);
   await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists()&&old.data().status!=='rejected')throw Error('Já submeteste esta tarefa.');const data={taskId:id,childId:user.uid,periodKey:p.key,periodStart:p.start,points:t.points,status:'pending',submittedAt:serverTimestamp()};if(old.exists())tx.update(ref,{status:'pending',submittedAt:serverTimestamp()});else tx.set(ref,data);});
 }else{
   const c=claims.find(c=>c.id===id);if(!c||!myKids().some(k=>k.uid===c.childId))throw Error('Sem autorização.');
   await runTransaction(db,async tx=>{const ref=doc(db,'claims',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status!=='pending')throw Error('Pedido já tratado.');tx.update(ref,{status:action==='approveClaim'?'approved':'rejected',reviewedBy:user.uid,reviewedAt:serverTimestamp()});});
 }
 await load();render();notice('Alteração guardada.');
}

async function invite(form,role){
 const data=new FormData(form),name=String(data.get('name')||'').trim(),email=normalize(data.get('email'));
 if(!name||!email.includes('@'))throw Error('Preenche um nome e um email válido.');
 const guardianIds=role==='child'?data.getAll('guardian'):[];
 if(role==='child'&&!guardianIds.length)throw Error('Seleciona pelo menos um encarregado.');
 if(role==='child'&&guardianIds.some(id=>!people.some(p=>p.uid===id&&p.role==='guardian'&&p.status==='active')))throw Error('Encarregado inválido.');
 if(people.some(p=>normalize(p.email)===email))throw Error('Este email já tem uma conta registada.');
 await setDoc(doc(db,'invitations',email),{name,email,role,guardianIds,createdBy:user.uid,createdAt:serverTimestamp()});
 notice('Convite guardado. A pessoa já pode criar a sua conta com este email.');await load();render();
}
$('authform').addEventListener('submit',async e=>{e.preventDefault();try{notice('A entrar…');await signInWithEmailAndPassword(auth,$('email').value,$('password').value);notice('');}catch(err){notice('Não foi possível entrar: '+err.message)}});
$('register').addEventListener('click',async()=>{try{notice('A criar conta…');await createUserWithEmailAndPassword(auth,$('email').value,$('password').value);notice('Conta criada. Aguarda autorização do administrador.');}catch(err){notice('Não foi possível criar conta: '+err.message)}});
$('logout').addEventListener('click',()=>signOut(auth));
$('tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render()}});
$('screen').addEventListener('submit',async e=>{if(!['guardianForm','childForm','taskForm'].includes(e.target.id))return;e.preventDefault();try{if(e.target.id==='taskForm')await createTask(e.target);else await invite(e.target,e.target.id==='guardianForm'?'guardian':'child')}catch(err){notice(err.message)}});
$('screen').addEventListener('click',async e=>{const btn=e.target.closest('[data-action]');if(!btn)return;try{btn.disabled=true;if(['submitTask','approveClaim','rejectClaim'].includes(btn.dataset.action)){await taskAction(btn.dataset.action,btn.dataset.id);return;}if(!isAdmin())throw Error('Sem autorização.');if(btn.dataset.action==='approve')await updateDoc(doc(db,'profiles',btn.dataset.id),{status:'active',approvedBy:user.uid,approvedAt:serverTimestamp()});if(btn.dataset.action==='deleteInvite')await deleteDoc(doc(db,'invitations',btn.dataset.id));await load();render();notice('Alteração guardada.')}catch(err){notice(err.message);btn.disabled=false}});
onAuthStateChanged(auth,async current=>{user=current;profile=null;people=[];invites=[];try{if(user){await bootstrap();await load();}render();}catch(err){render();notice('Erro ao carregar os dados: '+err.message)}});
