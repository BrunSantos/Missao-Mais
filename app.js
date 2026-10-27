import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,query,where,updateDoc,deleteDoc,deleteField,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,ADMIN_UID} from './firebase-settings-v3.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').trim().toLowerCase();
let user=null,profile=null,people=[],invites=[],tasks=[],claims=[],rewards=[],redemptions=[],tab='inicio';
const isAdmin=()=>!!user&&!!ADMIN_UID&&user.uid===ADMIN_UID;
const notice=s=>{$('feedback').textContent=s};
const avatarMarkup=(p,cls='')=>`<span class="kid-avatar ${cls}" aria-label="Fotografia de ${esc(p.name)}">${p.photoData?`<img src="${esc(p.photoData)}" alt="" loading="lazy">`:`<img src="./avatar-default.svg" alt="Avatar genérico" loading="lazy">`}</span>`;
function hydrateAvatars(){} // Fotografias incluídas nos perfis carregados do Firestore.
function allowedPhoto(id){return !!user&&(isAdmin()||((profile?.role==='guardian'||isAdmin())&&profile?.status==='active'&&myKids().some(k=>k.uid===id)));}
async function processPhoto(file,id){
 if(!allowedPhoto(id))throw Error('Sem autorização para alterar esta fotografia.');
 if(!file||!file.type.startsWith('image/'))throw Error('Seleciona uma imagem válida.');
 if(file.size>12*1024*1024)throw Error('A imagem deve ter menos de 12 MB.');
 const bitmap=typeof createImageBitmap==='function'?await createImageBitmap(file).catch(()=>null):null;
 const img=bitmap||await new Promise((resolve,reject)=>{const im=new Image(),url=URL.createObjectURL(file);im.onload=()=>{URL.revokeObjectURL(url);resolve(im)};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Não foi possível abrir a imagem.'))};im.src=url});
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;
 const ctx=canvas.getContext('2d'),side=Math.min(img.width,img.height);
 ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,192,192);
 if(bitmap)bitmap.close();
 let quality=.75,data=canvas.toDataURL('image/jpeg',quality);
 while(data.length>65000&&quality>.3){quality-=.1;data=canvas.toDataURL('image/jpeg',quality);}
 if(data.length>100000)throw Error('A fotografia é demasiado grande. Tenta outra imagem.');
 await updateDoc(doc(db,'profiles',id),{photoData:data,photoPath:deleteField()});
 await load();render();notice('Fotografia atualizada.');
}
async function removePhoto(id){
 if(!allowedPhoto(id))throw Error('Sem autorização.');
 await updateDoc(doc(db,'profiles',id),{photoData:deleteField(),photoPath:deleteField()});
 await load();render();notice('Fotografia removida.');
}
const personName=id=>people.find(p=>p.uid===id)?.name||'Conta pendente';
const associated=id=>isAdmin()||((profile?.role==='guardian'||isAdmin())&&profile?.status==='active'&&(people.some(p=>p.uid===id&&p.role==='child'&&(p.guardianIds||[]).includes(user.uid))));
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
const PRESET_GROUPS={
 'Higiene pessoal':['Lavar os dentes','Vestir-me sozinho','Tomar o pequeno-almoço','Deitar-me a horas'],
 'Responsabilidades diárias':['Fazer a cama','Preparar a mochila','Preparar a roupa para amanhã'],
 'Escola e estudo':['Fazer os trabalhos de casa','Estudar 20 minutos','Ler 15 minutos'],
 'Organização e arrumação':['Arrumar o quarto','Arrumar os brinquedos','Dobrar a roupa'],
 'Tarefas domésticas':['Pôr a mesa','Levantar a mesa','Colocar a loiça na máquina','Tirar a loiça da máquina','Levar o lixo','Separar a reciclagem','Regar as plantas','Aspirar o quarto','Limpar o pó','Ajudar a preparar uma refeição','Dar comida ao animal de estimação']
};
const presetGroupFor=name=>Object.entries(PRESET_GROUPS).find(([,names])=>names.includes(name))?.[0]||'Responsabilidades diárias';
const WEEKDAYS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const weekdayIndex=()=>{const d=new Date().getDay();return (d+6)%7;};
const scheduledToday=t=>t.frequency!=='daily'||!Array.isArray(t.weekdays)||t.weekdays.includes(weekdayIndex());
const scheduleLabel=t=>t.frequency==='daily'&&Array.isArray(t.weekdays)?' · '+t.weekdays.map(i=>WEEKDAYS[i]).join(', '):'';
const activeTask=t=>t.active!==false;
const claimLabel=c=>c.status==='pending'?'Pendente':c.status==='approved'?'Aprovada':'Rejeitada';


async function load(){
  const snap=await getDoc(doc(db,'profiles',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:null;
  if(isAdmin()){
    const [p,i]=await Promise.all([getDocs(collection(db,'profiles')),getDocs(collection(db,'invitations'))]);
    people=p.docs.map(d=>({uid:d.id,...d.data()}));invites=i.docs.map(d=>({email:d.id,...d.data()}));
  }else if((profile?.role==='guardian'||isAdmin())&&profile?.status==='active'){
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
    if(!snap.exists())await setDoc(ref,{name:user.email,email:normalize(user.email),role:'admin',status:'active',guardianIds:[],balance:0,createdAt:serverTimestamp()});
    else if(snap.data().role!=='admin'||snap.data().status!=='active')await updateDoc(ref,{role:'admin',status:'active'});
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
 $('identity').textContent=(profile?.name||user.email)+(isAdmin()?' · Administrador':'');
 const allowed=isAdmin()?['inicio','pessoas','tarefas','aprovações','recompensas']:profile?.status==='active'&&profile?.role==='guardian'?['inicio','pessoas','tarefas','aprovações','recompensas']:profile?.status==='active'&&profile?.role==='child'?['inicio','tarefas','recompensas']:['inicio'];
 if(!allowed.includes(tab))tab='inicio';
 $('tabs').innerHTML=allowed.map(t=>`<button class="${tab===t?'':'alt'}" data-tab="${t}">${t==='pessoas'?'Família':t[0].toUpperCase()+t.slice(1)}</button>`).join('');
 $('screen').innerHTML=tab==='pessoas'?members():tab==='inicio'?home():tab==='tarefas'?taskScreen():tab==='aprovações'?approvalScreen():rewardScreen();
 if(tab==='tarefas')filterPresetGroup();
 hydrateAvatars();
}
function weeklyProgress(kidId){
 const now=new Date(),monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
 const sunday=new Date(monday);sunday.setDate(sunday.getDate()+7);
 const dated=claims.filter(c=>c.childId===kidId).filter(c=>{
   const stamp=c.submittedAt||c.reviewedAt;
   const date=stamp?.toDate?.();
   return date instanceof Date&&date>=monday&&date<sunday;
 });
 const approved=dated.filter(c=>c.status==='approved');
 const points=approved.reduce((total,c)=>total+Number(c.points||0),0);
 return {completed:approved.length,points,pending:dated.filter(c=>c.status==='pending').length};
}
function home(){
 const adult=isAdmin()||profile?.role==='guardian';
 const kids=adult?myKids():profile?.role==='child'?[profile]:[];
 const ids=new Set(kids.map(k=>k.uid));
 const pendingClaims=claims.filter(c=>c.status==='pending'&&ids.has(c.childId));
 const pendingRewards=redemptions.filter(r=>r.status==='pending'&&ids.has(r.childId));
 const cards=kids.map(k=>{
   const kidTasks=tasks.filter(t=>t.childId===k.uid&&activeTask(t)&&scheduledToday(t));
   const pending=pendingClaims.filter(c=>c.childId===k.uid).length;
   const week=weeklyProgress(k.uid);
   return `<article class="card"><h3 class="kid-heading">${avatarMarkup(k)} ${esc(k.name)}</h3>${adult&&allowedPhoto(k.uid)?`<div class="photo-actions"><label class="photo-button">📷 Câmara<input type="file" accept="image/*" capture="environment" data-photo="${esc(k.uid)}"></label><label class="photo-button">🖼️ Galeria<input type="file" accept="image/*" data-photo="${esc(k.uid)}"></label>${k.photoData?`<button type="button" class="alt" data-action="removePhoto" data-id="${esc(k.uid)}">Remover foto</button>`:''}</div>`:''}<div class="points">${score(k.uid)} ⭐</div><p class="muted">${kidTasks.length} tarefas previstas hoje · ${pending} por aprovar</p><div class="week-stats"><b>Esta semana</b><span>${week.completed} tarefas aprovadas</span><span>+${week.points} ⭐ conquistados</span>${week.pending?`<span>${week.pending} a aguardar aprovação</span>`:''}</div></article>`;
 }).join('');
 if(!isAdmin()&&(!profile||profile.status!=='active'))return `<h2>Bem-vindo à Missão+</h2><p>${!profile?'Ainda não existe um convite para este email. Pede ao administrador que te adicione.':'A tua conta foi criada. Aguarda a autorização do administrador.'}</p><p class="muted">Se esta deveria ser a tua conta de administrador, verifica se entraste com o email original. O acesso administrativo está associado ao identificador da conta no Firebase Authentication, não ao nome ou email apresentado.</p>`;
 const summary=adult?`<div class="grid"><article class="card"><h3>Tarefas por aprovar</h3><div class="points">${pendingClaims.length}</div></article><article class="card"><h3>Recompensas pedidas</h3><div class="points">${pendingRewards.length}</div></article><article class="card"><h3>Filhos associados</h3><div class="points">${kids.length}</div></article></div>`:'';
 const actions=`<div class="login-actions"><button type="button" data-go="tarefas">Ver tarefas</button>${adult?'<button type="button" class="alt" data-go="aprovações">Ver aprovações</button>':''}<button type="button" class="alt" data-go="recompensas">Ver recompensas</button><button type="button" class="alt" data-action="refreshData">Atualizar dados</button></div>`;
 return `<h2>O teu painel</h2><p class="muted">Resumo das missões e recompensas</p>${summary}<h3>${adult?'Pontos dos filhos':'Os meus pontos e tarefas'}</h3><div class="grid">${cards||'<p>Ainda não existem filhos associados.</p>'}</div>${actions}`;
}

function members(){
 const guardians=isAdmin()?[{uid:user.uid,name:profile?.name||user.email,email:user.email,role:'admin',status:'active'},...people.filter(p=>p.uid!==user.uid&&p.role==='guardian'&&p.status==='active')]:[profile];
 const children=people.filter(p=>p.role==='child'&&(isAdmin()||(p.guardianIds||[]).includes(user.uid)));
 const childOptions=guardians.map(g=>`<label class="check"><input type="checkbox" name="guardian" value="${esc(g.uid)}" ${g.uid===user.uid?'checked':''}> ${esc(g.name)} (${esc(g.email)})</label>`).join('');
 const invitations=(isAdmin()?invites:[]).map(i=>`<article class="item"><div><b>${esc(i.name)}</b><p class="muted">${esc(i.email)} · ${i.role==='guardian'?'Encarregado':'Filho'} · Convite criado</p></div><button class="alt" data-action="deleteInvite" data-id="${esc(i.email)}">Remover convite</button></article>`).join('');
 const accounts=people.filter(p=>p.uid!==ADMIN_UID&&(isAdmin()||p.role==='child'&&(p.guardianIds||[]).includes(user.uid))).map(p=>`<article class="item"><div>${p.role==='child'?avatarMarkup(p):''}<b>${esc(p.name)}</b><p class="muted">${esc(p.email)} · ${p.role==='guardian'?'Encarregado':'Filho'} · ${p.status==='active'?'Ativo':'Aguarda aprovação'}</p>${p.role==='child'?`<p class="muted">Encarregados: ${(p.guardianIds||[]).map(id=>esc(personName(id))).join(', ')||'Nenhum'}</p><div class="photo-actions"><label class="photo-button">📷 Câmara<input type="file" accept="image/*" capture="environment" data-photo="${esc(p.uid)}"></label><label class="photo-button">🖼️ Galeria<input type="file" accept="image/*" data-photo="${esc(p.uid)}"></label>${p.photoData?`<button type="button" class="alt" data-action="removePhoto" data-id="${esc(p.uid)}">Remover foto</button>`:''}</div>`:''}</div>${isAdmin()&&p.status==='pending'?`<button data-action="approve" data-id="${esc(p.uid)}">Autorizar</button>`:''}</article>`).join('');
 return `<h2>Família e acessos</h2><p class="muted">${isAdmin()?'Como administrador, também podes ser encarregado dos teus filhos.':'Podes convidar um filho para a tua família. A ativação da conta depende da aprovação do administrador.'} Cada filho cria a sua própria password.</p>
 <div class="grid">${isAdmin()?`<article class="card"><h3>Adicionar encarregado</h3><form id="guardianForm"><label>Nome<input name="name" required maxlength="100"></label><label>Email<input name="email" type="email" required></label><button>Criar convite</button></form></article>`:""}
 <article class="card"><h3>Adicionar filho</h3><p class="muted">Cria um convite para o teu filho se registar com a própria password.</p>${guardians.length?`<form id="childForm"><label>Nome<input name="name" required maxlength="100"></label><label>Email para iniciar sessão<input name="email" type="email" required></label><fieldset><legend>Associar aos encarregados ativos</legend>${isAdmin()?childOptions:`<label class="check"><input type="checkbox" name="guardian" value="${esc(user.uid)}" checked disabled> Eu (${esc(profile.name)})</label><input type="hidden" name="guardian" value="${esc(user.uid)}">`}</fieldset><button>Criar convite do filho</button></form>`:'<p>Autoriza primeiro pelo menos um encarregado de educação.</p>'}</article></div>
 ${isAdmin()?`<article class="card"><h3>Convites</h3>${invitations||'<p class="muted">Ainda não existem convites.</p>'}<p class="muted">Partilha com cada pessoa o endereço da Missão+ e pede-lhe que clique em «Criar conta» com o email convidado. O convite não envia emails automaticamente.</p></article>`:''}
 <article class="card"><h3>Utilizadores registados</h3>${accounts||'<p class="muted">Ainda não existem utilizadores.</p>'}</article>`;
}
function taskScreen(){
 const adult=isAdmin()||profile?.role==='guardian',kids=myKids();
 const groups=Object.keys(PRESET_GROUPS),groupOptions=`<option value="all">Todas as categorias</option>`+groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
 const weekdayControls=WEEKDAYS.map((day,i)=>`<label class="day-check"><input type="checkbox" name="weekday" value="${i}" checked><span>${day}</span></label>`).join('');
 const form=adult?`<article class="card"><h3>Nova tarefa</h3><p class="muted">Seleciona uma categoria e pesquisa diretamente na lista. Também podes escrever uma tarefa nova.</p><form id="taskForm"><label>Tipo de tarefa<select id="taskPresetGroup" aria-label="Tipo de tarefa">${groupOptions}</select></label><label>Escolher ou pesquisar tarefa<div class="combo" id="taskCombo"><input id="taskPresetSearch" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="presetChoices" placeholder="Escreve para pesquisar ou escolhe uma tarefa…"><button type="button" class="combo-arrow" id="taskComboToggle" aria-label="Mostrar tarefas">⌄</button><div id="presetChoices" class="combo-options" role="listbox" hidden></div></div></label><label>Nome da tarefa (podes editar)<input name="title" id="taskTitle" required maxlength="120" placeholder="Escreve uma tarefa personalizada"></label><label>Descrição<textarea name="description" maxlength="600" placeholder="Instruções opcionais"></textarea></label><label>Tipo<select name="category" id="taskCategory"><option value="Responsabilidade">Responsabilidade diária</option><option value="Tarefa doméstica">Tarefa doméstica</option></select></label><label>Período<select name="period" id="taskPeriod"><option>Manhã</option><option>Depois da escola</option><option>Noite</option><option>Outro</option></select></label><label>Pontos<input name="points" id="taskPoints" type="number" min="1" max="500" required value="10"></label><label>Frequência<select name="frequency" id="taskFrequency"><option value="daily">Diária</option><option value="weekly">Semanal (uma vez por semana)</option><option value="once">Pontual</option></select></label><fieldset id="weekdayField"><legend>Dias da semana em que a tarefa se repete</legend><div class="weekday-grid">${weekdayControls}</div><p class="muted">Seleciona os dias pretendidos. Em cada dia selecionado, a tarefa pode ser concluída uma vez.</p></fieldset><label>Hora limite (opcional)<input name="deadline" type="time"></label><fieldset><legend>Filhos associados</legend>${kids.map(k=>`<label class="check"><input type="checkbox" name="child" value="${esc(k.uid)}">${esc(k.name)}</label>`).join('')||'<p>Primeiro associa um filho ativo.</p>'}</fieldset><button>Criar tarefa</button></form></article>`:'';
 const visible=tasks.filter(t=>adult?kids.some(k=>k.uid===t.childId):t.childId===user.uid);
 return `<h2>Tarefas e responsabilidades</h2><p class="muted">Escolhe uma sugestão ou escreve a tua própria tarefa. Os pontos só contam depois da aprovação.</p>${form}<article class="card"><div class="filterbar"><label>Pesquisar tarefas<input id="taskSearch" type="search" placeholder="Nome ou descrição"></label><label>Mostrar<select id="taskStatusFilter"><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select></label></div><p class="muted" id="taskCount"></p></article><div id="editTaskContainer"></div><article class="card"><h3>Calendário semanal</h3><p class="muted">Tarefas previstas para cada dia, por filho.</p><div class="weekly-calendar">${WEEKDAYS.map((day,i)=>`<section class="weekly-day"><b>${day}</b>${visible.filter(t=>activeTask(t)&&(t.frequency==='daily'?(!Array.isArray(t.weekdays)||t.weekdays.includes(i)):t.frequency==='weekly')).map(t=>`<p>${esc(t.title)} <small>(${esc(personName(t.childId))})</small></p>`).join('')||'<small>Sem tarefas diárias</small>'}</section>`).join('')}</div></article><div class="grid" id="taskList">${visible.map(t=>{const per=period(t),claim=claims.find(c=>c.taskId===t.id&&c.childId===t.childId&&c.periodKey===per.key);return `<article class="card task-card" data-search="${esc((t.title+' '+(t.description||'')+' '+personName(t.childId)).toLowerCase())}" data-active="${activeTask(t)?'yes':'no'}"><div class="row"><h3>${esc(t.title)}</h3><span class="pill">${Number(t.points)} ⭐</span></div><p>${esc(t.description||'')}</p><p class="muted">${esc(t.category)} · ${esc(t.period)} · ${esc(t.frequency==='daily'?'Diária':t.frequency==='weekly'?'Semanal':'Pontual')}${scheduleLabel(t)}${t.deadline?' · até '+esc(t.deadline):''}</p>${adult?`<p>Para: ${esc(personName(t.childId))}</p><p class="muted">${activeTask(t)?'Ativa':'Arquivada'}</p><div class="task-actions"><button class="alt" data-action="editTask" data-id="${esc(t.id)}">Editar</button>${activeTask(t)?`<button class="alt" data-action="archiveTask" data-id="${esc(t.id)}">Arquivar</button>`:`<button class="alt" data-action="restoreTask" data-id="${esc(t.id)}">Reativar</button>`}</div>`:`<p>${claim?'Estado: '+(claim.status==='pending'?'A aguardar aprovação':claim.status==='approved'?'Aprovada':'Rejeitada — podes tentar novamente'):'Ainda não submetida'}</p>${!scheduledToday(t)?'<p class="muted">Não está prevista para hoje.</p>':''}${activeTask(t)&&scheduledToday(t)&&(!claim||claim.status==='rejected')?`<button data-action="submitTask" data-id="${esc(t.id)}">Marcar como concluída</button>`:''}`}</article>`}).join('')}</div>`;
}
function openTaskEditor(id){
 const t=tasks.find(x=>x.id===id),target=$('editTaskContainer');
 if(!t||!target||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');
 const opts=(values,selected)=>values.map(v=>`<option value="${esc(v[0])}" ${v[0]===selected?'selected':''}>${esc(v[1])}</option>`).join('');
 const days=WEEKDAYS.map((day,i)=>`<label class="day-check"><input type="checkbox" name="weekday" value="${i}" ${!Array.isArray(t.weekdays)||t.weekdays.includes(i)?'checked':''}><span>${day}</span></label>`).join('');
 target.innerHTML=`<article class="card"><h3>Editar tarefa — ${esc(t.title)}</h3><form id="editTaskForm" data-id="${esc(t.id)}"><label>Nome<input name="title" required maxlength="120" value="${esc(t.title)}"></label><label>Descrição<textarea name="description" maxlength="600">${esc(t.description||'')}</textarea></label><label>Tipo<select name="category">${opts([['Responsabilidade','Responsabilidade diária'],['Tarefa doméstica','Tarefa doméstica']],t.category)}</select></label><label>Período<select name="period">${opts(['Manhã','Depois da escola','Noite','Outro'].map(x=>[x,x]),t.period)}</select></label><label>Pontos<input name="points" type="number" min="1" max="500" required value="${Number(t.points)}"></label><label>Frequência<select name="frequency" id="editTaskFrequency">${opts([['daily','Diária'],['weekly','Semanal'],['once','Pontual']],t.frequency)}</select></label><fieldset id="editWeekdayField" ${t.frequency!=='daily'?'hidden':''}><legend>Dias da semana</legend><div class="weekday-grid">${days}</div></fieldset><label>Hora limite<input name="deadline" type="time" value="${esc(t.deadline||'')}"></label><p class="muted">Associada a ${esc(personName(t.childId))}. O histórico de conclusões e os pontos anteriores são preservados.</p><div class="task-actions"><button type="submit">Guardar alterações</button><button type="button" class="alt" data-action="cancelEdit">Cancelar</button></div></form></article>`;
 target.scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveTaskEdit(form){
 const t=tasks.find(x=>x.id===form.dataset.id);if(!t||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');
 const f=new FormData(form),title=String(f.get('title')||'').trim(),points=Number(f.get('points')),frequency=f.get('frequency');
 const weekdays=[...new Set(f.getAll('weekday').map(Number))].sort((a,b)=>a-b);
 if(!title||!Number.isInteger(points)||points<1||points>500)throw Error('Verifica o nome e os pontos.');
 if(frequency==='daily'&&!weekdays.length)throw Error('Seleciona pelo menos um dia.');
 await updateDoc(doc(db,'tasks',t.id),{title,description:String(f.get('description')||'').trim(),category:f.get('category'),period:f.get('period'),points,frequency,weekdays:frequency==='daily'?weekdays:[],deadline:f.get('deadline')||''});
 await load();render();applyTaskFilters();notice('Tarefa atualizada. Histórico preservado.');
}
function applyTaskFilters(){
 const search=normalize($('taskSearch')?.value),filter=$('taskStatusFilter')?.value||'active';let count=0;
 document.querySelectorAll('.task-card').forEach(card=>{const active=card.dataset.active==='yes',show=(!search||card.dataset.search.includes(search))&&(filter==='all'||(filter==='active'?active:!active));card.hidden=!show;if(show)count++;});
 if($('taskCount'))$('taskCount').textContent=count+' tarefa(s) encontrada(s)';
}
function filterPresetGroup(open=false){
 const group=$('taskPresetGroup')?.value||'all', input=$('taskPresetSearch'), list=$('presetChoices');
 if(!input||!list)return;
 const search=normalize(input.value);
 const matches=PRESETS.map((t,i)=>({t,i})).filter(({t})=>(group==='all'||presetGroupFor(t[0])===group)&&(!search||normalize(t[0]).includes(search)));
 list.innerHTML=matches.map(({t,i})=>`<button type="button" role="option" class="combo-option" data-preset-index="${i}">${esc(t[0])}${group==='all'?` <small>· ${esc(presetGroupFor(t[0]))}</small>`:''}</button>`).join('')+'<button type="button" role="option" class="combo-option custom" data-preset-index="">✏️ Usar tarefa personalizada</button>';
 list.hidden=!open;input.setAttribute('aria-expanded',String(open));
 if(!matches.length)list.innerHTML='<div class="combo-empty">Sem sugestões. Podes utilizar o texto escrito como tarefa personalizada.</div>'+list.innerHTML;
}
function choosePreset(idx){
 const input=$('taskPresetSearch');if(!input)return;
 if(idx===''){
  const typed=input.value.trim();$('taskTitle').value=typed;input.value=typed;
 }else{
  const t=PRESETS[Number(idx)];if(!t)return;
  input.value=t[0];$('taskTitle').value=t[0];$('taskCategory').value=t[1];$('taskPeriod').value=t[2];$('taskPoints').value=t[3];$('taskFrequency').value=t[4];
 }
 filterPresetGroup(false);
}
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
 const weekdays=f.get('frequency')==='daily'?[...new Set(f.getAll('weekday').map(Number))].sort((a,b)=>a-b):[];
 if(f.get('frequency')==='daily'&&(!weekdays.length||weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)))throw Error('Seleciona pelo menos um dia da semana.');
 for(const childId of ids){const ref=doc(collection(db,'tasks'));await setDoc(ref,{title,description:String(f.get('description')||'').trim(),category:f.get('category'),period:f.get('period'),points,frequency:f.get('frequency'),weekdays,deadline:f.get('deadline'),childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});}
 await load();render();applyTaskFilters();notice('Tarefa criada.');
}
async function taskAction(action,id){
 if(action==='submitTask'){
   const t=tasks.find(t=>t.id===id);if(!t||!activeTask(t)||!scheduledToday(t)||profile?.role!=='child'||t.childId!==user.uid)throw Error('Tarefa não disponível.');
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
 if(role==='child'&&guardianIds.some(id=>!(isAdmin()?(id===user.uid||people.some(p=>p.uid===id&&(p.role==='guardian'||p.role==='admin')&&p.status==='active')):id===user.uid)))throw Error('Encarregado inválido.');
 if(people.some(p=>normalize(p.email)===email))throw Error('Este email já tem uma conta registada.');
 await setDoc(doc(db,'invitations',email),{name,email,role,guardianIds,createdBy:user.uid,createdAt:serverTimestamp()});
 notice('Convite guardado. A pessoa já pode criar a sua conta com este email.');await load();render();
}
$('authform').addEventListener('submit',async e=>{e.preventDefault();try{notice('A entrar…');await signInWithEmailAndPassword(auth,$('email').value,$('password').value);notice('');}catch(err){notice(({'auth/invalid-credential':'Email ou password incorretos. Podes usar «Recuperar password» para definir uma nova.','auth/invalid-email':'O email não é válido.','auth/too-many-requests':'Demasiadas tentativas. Aguarda alguns minutos.','auth/network-request-failed':'Sem ligação à Internet.'}[err.code])||('Não foi possível entrar: '+err.message))}});
$('resetPassword').addEventListener('click',async()=>{const email=$('email').value.trim();if(!email){notice('Introduz primeiro o email da tua conta para receberes a ligação de recuperação.');$('email').focus();return;}try{notice('A pedir recuperação de password…');await sendPasswordResetEmail(auth,email);notice('Pedido enviado. Se existir uma conta associada a este email, receberás uma mensagem com uma ligação para redefinir a password. Verifica também o spam.');}catch(err){const messages={'auth/invalid-email':'O endereço de email não é válido.','auth/too-many-requests':'Demasiadas tentativas. Aguarda alguns minutos e volta a tentar.','auth/network-request-failed':'Falha de ligação à Internet. Tenta novamente.','auth/operation-not-allowed':'A recuperação por email não está ativada no Firebase Authentication.'};notice(messages[err.code]||('Não foi possível pedir a recuperação: '+err.message));}});
$('register').addEventListener('click',async()=>{try{notice('A criar conta…');await createUserWithEmailAndPassword(auth,$('email').value,$('password').value);notice('Conta criada. Aguarda autorização do administrador.');}catch(err){notice('Não foi possível criar conta: '+err.message)}});
$('logout').addEventListener('click',()=>signOut(auth));
$('tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render();if(tab==='tarefas')applyTaskFilters()}});
$('screen').addEventListener('change',async e=>{if(e.target.matches('[data-photo]')){try{notice('A guardar fotografia…');await processPhoto(e.target.files?.[0],e.target.dataset.photo);}catch(err){notice('Não foi possível guardar: '+err.message)}return;}if(e.target.id==='taskPresetGroup'){if($('taskPresetSearch'))$('taskPresetSearch').value='';filterPresetGroup(false);}if(e.target.id==='taskStatusFilter')applyTaskFilters();if(e.target.id==='taskFrequency'&&$('weekdayField'))$('weekdayField').hidden=e.target.value!=='daily';if(e.target.id==='editTaskFrequency'&&$('editWeekdayField'))$('editWeekdayField').hidden=e.target.value!=='daily';});
$('screen').addEventListener('input',e=>{if(e.target.id==='taskSearch')applyTaskFilters();if(e.target.id==='taskPresetSearch'){if($('taskTitle'))$('taskTitle').value=e.target.value;filterPresetGroup(true);}});
$('screen').addEventListener('submit',async e=>{if(!['guardianForm','childForm','taskForm','editTaskForm','rewardForm'].includes(e.target.id))return;e.preventDefault();try{if(e.target.id==='taskForm')await createTask(e.target);else if(e.target.id==='editTaskForm')await saveTaskEdit(e.target);else if(e.target.id==='rewardForm')await createReward(e.target);else await invite(e.target,e.target.id==='guardianForm'?'guardian':'child')}catch(err){notice(err.message)}});
$('screen').addEventListener('click',async e=>{const go=e.target.closest('[data-go]');if(go){tab=go.dataset.go;render();if(tab==='tarefas')applyTaskFilters();return;}if(e.target.closest('[data-preset-index]')){choosePreset(e.target.closest('[data-preset-index]').dataset.presetIndex);return;}if(e.target.id==='taskComboToggle'){filterPresetGroup($('presetChoices')?.hidden);$('taskPresetSearch')?.focus();return;}if(e.target.id==='taskPresetSearch'){filterPresetGroup(true);return;}const btn=e.target.closest('[data-action]');if(!btn)return;try{btn.disabled=true;if(btn.dataset.action==='removePhoto'){if(confirm('Remover a fotografia deste filho?'))await removePhoto(btn.dataset.id);else btn.disabled=false;return;}if(btn.dataset.action==='refreshData'){await load();render();notice('Dados atualizados.');return;}if(btn.dataset.action==='cancelEdit'){$('editTaskContainer').innerHTML='';return;}if(btn.dataset.action==='editTask'){openTaskEditor(btn.dataset.id);btn.disabled=false;return;}if(['requestReward','archiveReward','approveReward','rejectReward'].includes(btn.dataset.action)){await rewardAction(btn.dataset.action,btn.dataset.id);return;}if(['submitTask','approveClaim','rejectClaim'].includes(btn.dataset.action)){await taskAction(btn.dataset.action,btn.dataset.id);return;}if(btn.dataset.action==='duplicateTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');if(!confirm('Criar uma cópia de «'+t.title+'» para '+personName(t.childId)+'?')){btn.disabled=false;return;}await setDoc(doc(collection(db,'tasks')),{title:t.title,description:t.description||'',category:t.category,period:t.period,points:Number(t.points),frequency:t.frequency,weekdays:Array.isArray(t.weekdays)?t.weekdays:[],deadline:t.deadline||'',childId:t.childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});await load();render();applyTaskFilters();notice('Cópia criada. Podes arquivar a original quando quiseres.');return;}if(btn.dataset.action==='restoreTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||activeTask(t)||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');await updateDoc(doc(db,'tasks',t.id),{active:true});await load();render();applyTaskFilters();notice('Tarefa reativada.');return;}if(btn.dataset.action==='archiveTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||!activeTask(t)||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');if(!confirm('Arquivar esta tarefa? O histórico e os pontos aprovados serão mantidos.')){btn.disabled=false;return;}await updateDoc(doc(db,'tasks',t.id),{active:false});await load();render();applyTaskFilters();notice('Tarefa arquivada.');return;}if(!isAdmin())throw Error('Sem autorização.');if(btn.dataset.action==='approve')await updateDoc(doc(db,'profiles',btn.dataset.id),{status:'active',approvedBy:user.uid,approvedAt:serverTimestamp()});if(btn.dataset.action==='deleteInvite')await deleteDoc(doc(db,'invitations',btn.dataset.id));await load();render();notice('Alteração guardada.')}catch(err){notice(err.message);btn.disabled=false}});
document.addEventListener('click',e=>{if($('taskCombo')&&!e.target.closest('#taskCombo'))filterPresetGroup(false);});
onAuthStateChanged(auth,async current=>{user=current;profile=null;people=[];invites=[];try{if(user){await bootstrap();await load();}render();}catch(err){render();notice('Erro ao carregar os dados: '+err.message)}});
