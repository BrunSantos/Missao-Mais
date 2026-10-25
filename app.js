import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,query,where,updateDoc,deleteDoc,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,ADMIN_UID} from './firebase-settings-v3.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').trim().toLowerCase();
let user=null,profile=null,people=[],invites=[],tasks=[],claims=[],rewards=[],redemptions=[],tab='inicio';
const isAdmin=()=>user?.uid===ADMIN_UID;
const notice=s=>{$('feedback').textContent=s};
const personName=id=>people.find(p=>p.uid===id)?.name||'Conta pendente';
const associated=id=>isAdmin()||(profile?.role==='guardian'&&profile?.status==='active'&&(people.some(p=>p.uid===id&&p.role==='child'&&(p.guardianIds||[]).includes(user.uid))));
const myKids=()=>people.filter(p=>p.role==='child'&&p.status==='active'&&(isAdmin()||(p.guardianIds||[]).includes(user.uid)));
const earned=id=>claims.filter(c=>c.childId===id&&c.status==='approved').reduce((n,c)=>n+Number(c.points||0),0);
const spent=id=>redemptions.filter(r=>r.childId===id&&r.status==='approved').reduce((n,r)=>n+Number(r.cost||0),0);
const score=id=>earned(id)-spent(id);
const isoDay=d=>d.toISOString().slice(0,10);
function period(t){const d=new Date(),start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));if(t.frequency==='weekly')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);return t.frequency==='once'?{key:'once',start:null}:{key:isoDay(start),start};}
const taskTitle=id=>tasks.find(t=>t.id===id)?.title||'Tarefa';
const PRESETS=[
 ['Fazer a cama','Responsabilidade','Manhã',5,'daily'],['Lavar os dentes','Responsabilidade','Manhã',5,'daily'],['Vestir-me sozinho','Responsabilidade','Manhã',5,'daily'],['Tomar o pequeno-almoço','Responsabilidade','Manhã',5,'daily'],['Preparar a mochila','Responsabilidade','Noite',10,'daily'],['Fazer os trabalhos de casa','Responsabilidade','Depois da escola',15,'daily'],['Estudar 20 minutos','Responsabilidade','Depois da escola',15,'daily'],['Ler 15 minutos','Responsabilidade','Noite',10,'daily'],['Preparar a roupa para amanhã','Responsabilidade','Noite',5,'daily'],['Deitar-me a horas','Responsabilidade','Noite',10,'daily'],
 ['Arrumar o quarto','Tarefa doméstica','Outro',15,'daily'],['Arrumar os brinquedos','Tarefa doméstica','Outro',10,'daily'],['Pôr a mesa','Tarefa doméstica','Outro',10,'daily'],['Levantar a mesa','Tarefa doméstica','Outro',10,'daily'],['Colocar a loiça na máquina','Tarefa doméstica','Outro',10,'daily'],['Tirar a loiça da máquina','Tarefa doméstica','Outro',10,'daily'],['Levar o lixo','Tarefa doméstica','Outro',10,'weekly'],['Separar a reciclagem','Tarefa doméstica','Outro',10,'weekly'],['Regar as plantas','Tarefa doméstica','Outro',10,'weekly'],['Dobrar a roupa','Tarefa doméstica','Outro',15,'weekly'],['Aspirar o quarto','Tarefa doméstica','Outro',20,'weekly'],['Limpar o pó','Tarefa doméstica','Outro',15,'weekly'],['Ajudar a preparar uma refeição','Tarefa doméstica','Outro',15,'weekly'],['Dar comida ao animal de estimação','Tarefa doméstica','Outro',10,'daily']
];
const activeTask=t=>t.active!==false;
const claimLabel=c=>c.status==='pending'?'Pendente':c.status==='approved'?'Aprovada':'Rejeitada';


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
  tasks=await fetch('tasks');claims=await fetch('claims');rewards=await fetch('rewards');redemptions=await fetch('redemptions');
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
 const allowed=isAdmin()?['inicio','pessoas','tarefas','aprovações','recompensas']:profile?.status==='active'&&profile?.role==='guardian'?['inicio','tarefas','aprovações','recompensas']:profile?.status==='active'&&profile?.role==='child'?['inicio','tarefas','recompensas']:['inicio'];
 if(!allowed.includes(tab))tab='inicio';
 $('tabs').innerHTML=allowed.map(t=>`<button class="${tab===t?'':'alt'}" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('');
 $('screen').innerHTML=tab==='pessoas'?members():tab==='inicio'?home():tab==='tarefas'?taskScreen():tab==='aprovações'?approvalScreen():rewardScreen();
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
 const presets=PRESETS.map((t,i)=>`<option value="${i}">${esc(t[0])}</option>`).join('');
 const form=adult?`<article class="card"><h3>Nova tarefa</h3><p class="muted">Escolhe uma das 24 sugestões na lista. Para criar uma tarefa diferente, deixa selecionada a opção «Escrever uma tarefa personalizada» e preenche o nome.</p><form id="taskForm"><label>Escolher uma das 24 tarefas ou escrever outra<select name="preset" id="taskPreset"><option value="" selected>✏️ Escrever uma tarefa personalizada</option>${presets}</select></label><label>Nome da tarefa (podes editar)<input name="title" id="taskTitle" required maxlength="120" placeholder="Escreve uma tarefa personalizada"></label><label>Descrição<textarea name="description" maxlength="600" placeholder="Instruções opcionais"></textarea></label><label>Tipo<select name="category" id="taskCategory"><option value="Responsabilidade">Responsabilidade diária</option><option value="Tarefa doméstica">Tarefa doméstica</option></select></label><label>Período<select name="period" id="taskPeriod"><option>Manhã</option><option>Depois da escola</option><option>Noite</option><option>Outro</option></select></label><label>Pontos<input name="points" id="taskPoints" type="number" min="1" max="500" required value="10"></label><label>Frequência<select name="frequency" id="taskFrequency"><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="once">Pontual</option></select></label><label>Hora limite (opcional)<input name="deadline" type="time"></label><fieldset><legend>Filhos associados</legend>${kids.map(k=>`<label class="check"><input type="checkbox" name="child" value="${esc(k.uid)}">${esc(k.name)}</label>`).join('')||'<p>Primeiro associa um filho ativo.</p>'}</fieldset><button>Criar tarefa</button></form></article>`:'';
 const visible=tasks.filter(t=>adult?kids.some(k=>k.uid===t.childId):t.childId===user.uid);
 return `<h2>Tarefas e responsabilidades</h2><p class="muted">Escolhe uma sugestão ou escreve a tua própria tarefa. Os pontos só contam depois da aprovação.</p>${form}<article class="card"><div class="filterbar"><label>Pesquisar tarefas<input id="taskSearch" type="search" placeholder="Nome ou descrição"></label><label>Mostrar<select id="taskStatusFilter"><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select></label></div><p class="muted" id="taskCount"></p></article><div class="grid" id="taskList">${visible.map(t=>{const per=period(t),claim=claims.find(c=>c.taskId===t.id&&c.childId===t.childId&&c.periodKey===per.key);return `<article class="card task-card" data-search="${esc((t.title+' '+(t.description||'')+' '+personName(t.childId)).toLowerCase())}" data-active="${activeTask(t)?'yes':'no'}"><div class="row"><h3>${esc(t.title)}</h3><span class="pill">${Number(t.points)} ⭐</span></div><p>${esc(t.description||'')}</p><p class="muted">${esc(t.category)} · ${esc(t.period)} · ${esc(t.frequency==='daily'?'Diária':t.frequency==='weekly'?'Semanal':'Pontual')}${t.deadline?' · até '+esc(t.deadline):''}</p>${adult?`<p>Para: ${esc(personName(t.childId))}</p><p class="muted">${activeTask(t)?'Ativa':'Arquivada'}</p>${activeTask(t)?`<button class="alt" data-action="archiveTask" data-id="${esc(t.id)}">Arquivar tarefa</button>`:''}`:`<p>${claim?'Estado: '+(claim.status==='pending'?'A aguardar aprovação':claim.status==='approved'?'Aprovada':'Rejeitada — podes tentar novamente'):'Ainda não submetida'}</p>${activeTask(t)&&(!claim||claim.status==='rejected')?`<button data-action="submitTask" data-id="${esc(t.id)}">Marcar como concluída</button>`:''}`}</article>`}).join('')}</div>`;
}
function applyTaskFilters(){
 const search=normalize($('taskSearch')?.value),filter=$('taskStatusFilter')?.value||'active';let count=0;
 document.querySelectorAll('.task-card').forEach(card=>{const active=card.dataset.active==='yes',show=(!search||card.dataset.search.includes(search))&&(filter==='all'||(filter==='active'?active:!active));card.hidden=!show;if(show)count++;});
 if($('taskCount'))$('taskCount').textContent=count+' tarefa(s) encontrada(s)';
}
function applyPreset(){const idx=$('taskPreset')?.value;if(idx==null)return;if(idx===''){$('taskTitle').value='';$('taskTitle').focus();return;}const t=PRESETS[Number(idx)];if(!t)return;$('taskTitle').value=t[0];$('taskCategory').value=t[1];$('taskPeriod').value=t[2];$('taskPoints').value=t[3];$('taskFrequency').value=t[4];}
function approvalScreen(){
 if(!(isAdmin()||profile?.role==='guardian'))return '<p>Sem acesso.</p>';
 const accessible=claims.filter(c=>myKids().some(k=>k.uid===c.childId));
 const pending=accessible.filter(c=>c.status==='pending'),history=accessible.filter(c=>c.status!=='pending').sort((a,b)=>(b.reviewedAt?.seconds||0)-(a.reviewedAt?.seconds||0)).slice(0,40);
 return `<h2>Aprovar tarefas</h2><p class="muted">Só a aprovação adiciona pontos ao total do filho.</p><h3>Pendentes (${pending.length})</h3><div class="grid">${pending.map(c=>`<article class="card"><h3>${esc(taskTitle(c.taskId))}</h3><p>${esc(personName(c.childId))} · ${Number(c.points)} ⭐</p><div class="login-actions"><button data-action="approveClaim" data-id="${esc(c.id)}">Aprovar</button><button class="red" data-action="rejectClaim" data-id="${esc(c.id)}">Rejeitar</button></div></article>`).join('')||'<p>Não há tarefas pendentes.</p>'}</div><h3>Histórico de decisões</h3><div class="grid">${history.map(c=>`<article class="card"><b>${esc(taskTitle(c.taskId))}</b><p>${esc(personName(c.childId))} · ${Number(c.points)} ⭐ · ${claimLabel(c)}</p></article>`).join('')||'<p>Ainda não há decisões.</p>'}</div>`;
}
async function createTask(form){
 if(!(isAdmin()||profile?.role==='guardian'))throw Error('Sem autorização.');
 const f=new FormData(form),ids=f.getAll('child'),points=Number(f.get('points'));
 if(!ids.length||ids.some(id=>!myKids().some(k=>k.uid===id)))throw Error('Seleciona filhos associados e ativos.');
 if(!Number.isInteger(points)||points<1||points>500)throw Error('Pontos inválidos.');
 const title=String(f.get('title')||'').trim();if(!title)throw Error('Indica o nome da tarefa.');
 for(const childId of ids){const ref=doc(collection(db,'tasks'));await setDoc(ref,{title,description:String(f.get('description')||'').trim(),category:f.get('category'),period:f.get('period'),points,frequency:f.get('frequency'),deadline:f.get('deadline'),childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});}
 await load();render();applyTaskFilters();notice('Tarefa criada.');
}
async function taskAction(action,id){
 if(action==='submitTask'){
   const t=tasks.find(t=>t.id===id);if(!t||!activeTask(t)||profile?.role!=='child'||t.childId!==user.uid)throw Error('Tarefa não disponível.');
   const p=period(t),claimId=`${id}_${user.uid}_${p.key}`,ref=doc(db,'claims',claimId);
   await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists()&&old.data().status!=='rejected')throw Error('Já submeteste esta tarefa.');const data={taskId:id,childId:user.uid,periodKey:p.key,periodStart:p.start,points:t.points,status:'pending',submittedAt:serverTimestamp()};if(old.exists())tx.update(ref,{status:'pending',submittedAt:serverTimestamp()});else tx.set(ref,data);});
 }else{
   const c=claims.find(c=>c.id===id);if(!c||!myKids().some(k=>k.uid===c.childId))throw Error('Sem autorização.');
   await runTransaction(db,async tx=>{const ref=doc(db,'claims',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status!=='pending')throw Error('Pedido já tratado.');tx.update(ref,{status:action==='approveClaim'?'approved':'rejected',reviewedBy:user.uid,reviewedAt:serverTimestamp()});});
 }
 await load();render();if(tab==='tarefas')applyTaskFilters();notice('Alteração guardada.');
}


function rewardScreen(){
 const adult=isAdmin()||profile?.role==='guardian',kids=myKids();
 const form=adult?`<article class="card"><h3>Nova recompensa</h3><form id="rewardForm"><label>Nome da recompensa<input name="title" required maxlength="120" placeholder="Ex.: Escolher o filme da noite"></label><label>Descrição (opcional)<textarea name="description" maxlength="500"></textarea></label><label>Custo em pontos<input name="cost" type="number" min="1" max="100000" value="50" required></label><fieldset><legend>Disponível para</legend>${kids.map(k=>`<label class="check"><input type="checkbox" name="child" value="${esc(k.uid)}">${esc(k.name)}</label>`).join('')||'<p>Associa primeiro um filho.</p>'}</fieldset><button>Criar recompensa</button></form></article>`:'';
 const accessible=rewards.filter(r=>adult?kids.some(k=>k.uid===r.childId):r.childId===user.uid);
 const pending=redemptions.filter(r=>r.status==='pending'&&(adult?kids.some(k=>k.uid===r.childId):r.childId===user.uid));
 const cards=accessible.map(r=>{const req=redemptions.find(x=>x.rewardId===r.id&&x.childId===r.childId&&x.status==='pending');return `<article class="card"><h3>${esc(r.title)}</h3><p>${esc(r.description||'')}</p><div class="points">${Number(r.cost)} ⭐</div><p class="muted">${esc(personName(r.childId))} · ${r.active===false?'Arquivada':'Disponível'}</p>${adult?(r.active!==false?`<button class="alt" data-action="archiveReward" data-id="${esc(r.id)}">Arquivar</button>`:''):(r.active!==false?`<button data-action="requestReward" data-id="${esc(r.id)}" ${req||score(user.uid)<r.cost?'disabled':''}>${req?'Pedido pendente':score(user.uid)<r.cost?'Pontos insuficientes':'Pedir recompensa'}</button>`:'')}</article>`}).join('');
 const approvals=adult?`<h3>Pedidos de recompensa pendentes (${pending.length})</h3><div class="grid">${pending.map(r=>`<article class="card"><b>${esc(r.title)}</b><p>${esc(personName(r.childId))} · ${Number(r.cost)} ⭐ · Saldo atual: ${score(r.childId)} ⭐</p><div class="login-actions"><button data-action="approveReward" data-id="${esc(r.id)}">Aprovar</button><button class="red" data-action="rejectReward" data-id="${esc(r.id)}">Rejeitar</button></div></article>`).join('')||'<p>Não existem pedidos pendentes.</p>'}</div>`:'';
 const history=redemptions.filter(r=>r.status!=='pending'&&(adult?kids.some(k=>k.uid===r.childId):r.childId===user.uid)).sort((a,b)=>(b.reviewedAt?.seconds||0)-(a.reviewedAt?.seconds||0)).slice(0,30);
 return `<h2>Recompensas</h2><p class="muted">Os filhos pedem recompensas com os pontos acumulados. Só são descontados após aprovação.</p>${!adult?`<div class="points">Saldo: ${score(user.uid)} ⭐</div>`:''}${form}<h3>Catálogo</h3><div class="grid">${cards||'<p>Ainda não existem recompensas.</p>'}</div>${approvals}<h3>Histórico de recompensas</h3><div class="grid">${history.map(r=>`<article class="card"><b>${esc(r.title)}</b><p>${esc(personName(r.childId))} · ${r.cost} ⭐ · ${r.status==='approved'?'Aprovada':'Rejeitada'}</p></article>`).join('')||'<p>Sem histórico.</p>'}</div>`;
}
async function createReward(form){
 if(!(isAdmin()||profile?.role==='guardian'))throw Error('Sem autorização.');
 const f=new FormData(form),ids=f.getAll('child'),title=String(f.get('title')||'').trim(),description=String(f.get('description')||'').trim(),cost=Number(f.get('cost'));
 if(!title||title.length>120||description.length>500||!Number.isInteger(cost)||cost<1||cost>100000)throw Error('Verifica os dados da recompensa.');
 if(!ids.length||ids.some(id=>!myKids().some(k=>k.uid===id)))throw Error('Seleciona pelo menos um filho associado.');
 for(const childId of ids)await setDoc(doc(collection(db,'rewards')),{title,description,cost,childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});
 await load();render();notice('Recompensa criada.');
}
async function rewardAction(action,id){
 if(action==='requestReward'){
  const r=rewards.find(r=>r.id===id);if(!r||r.active===false||profile?.role!=='child'||r.childId!==user.uid)throw Error('Recompensa indisponível.');
  if(score(user.uid)<r.cost)throw Error('Pontos insuficientes.');
  if(redemptions.some(x=>x.rewardId===id&&x.childId===user.uid&&x.status==='pending'))throw Error('Já tens um pedido pendente.');
  await setDoc(doc(collection(db,'redemptions')),{rewardId:id,childId:user.uid,title:r.title,cost:r.cost,status:'pending',requestedAt:serverTimestamp()});
 }else if(action==='archiveReward'){
  const r=rewards.find(r=>r.id===id);if(!r||r.active===false||!(isAdmin()||myKids().some(k=>k.uid===r.childId)))throw Error('Sem autorização.');
  await updateDoc(doc(db,'rewards',id),{active:false});
 }else{
  const r=redemptions.find(r=>r.id===id);if(!r||r.status!=='pending'||!myKids().some(k=>k.uid===r.childId))throw Error('Pedido não disponível.');
  if(action==='approveReward'&&score(r.childId)<r.cost)throw Error('Saldo insuficiente para aprovar.');
  await runTransaction(db,async tx=>{const ref=doc(db,'redemptions',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status!=='pending')throw Error('Pedido já tratado.');tx.update(ref,{status:action==='approveReward'?'approved':'rejected',reviewedBy:user.uid,reviewedAt:serverTimestamp()});});
 }
 await load();render();notice('Recompensa atualizada.');
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
$('tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render();if(tab==='tarefas')applyTaskFilters()}});
$('screen').addEventListener('change',e=>{if(e.target.id==='taskPreset')applyPreset();if(e.target.id==='taskStatusFilter')applyTaskFilters();});
$('screen').addEventListener('input',e=>{if(e.target.id==='taskSearch')applyTaskFilters();});
$('screen').addEventListener('submit',async e=>{if(!['guardianForm','childForm','taskForm','rewardForm'].includes(e.target.id))return;e.preventDefault();try{if(e.target.id==='taskForm')await createTask(e.target);else if(e.target.id==='rewardForm')await createReward(e.target);else await invite(e.target,e.target.id==='guardianForm'?'guardian':'child')}catch(err){notice(err.message)}});
$('screen').addEventListener('click',async e=>{const btn=e.target.closest('[data-action]');if(!btn)return;try{btn.disabled=true;if(['requestReward','archiveReward','approveReward','rejectReward'].includes(btn.dataset.action)){await rewardAction(btn.dataset.action,btn.dataset.id);return;}if(['submitTask','approveClaim','rejectClaim'].includes(btn.dataset.action)){await taskAction(btn.dataset.action,btn.dataset.id);return;}if(btn.dataset.action==='archiveTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||!activeTask(t)||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');if(!confirm('Arquivar esta tarefa? O histórico e os pontos aprovados serão mantidos.')){btn.disabled=false;return;}await updateDoc(doc(db,'tasks',t.id),{active:false});await load();render();applyTaskFilters();notice('Tarefa arquivada.');return;}if(!isAdmin())throw Error('Sem autorização.');if(btn.dataset.action==='approve')await updateDoc(doc(db,'profiles',btn.dataset.id),{status:'active',approvedBy:user.uid,approvedAt:serverTimestamp()});if(btn.dataset.action==='deleteInvite')await deleteDoc(doc(db,'invitations',btn.dataset.id));await load();render();notice('Alteração guardada.')}catch(err){notice(err.message);btn.disabled=false}});
onAuthStateChanged(auth,async current=>{user=current;profile=null;people=[];invites=[];try{if(user){await bootstrap();await load();}render();}catch(err){render();notice('Erro ao carregar os dados: '+err.message)}});
