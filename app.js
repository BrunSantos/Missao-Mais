import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,ADMIN_UID} from './firebase-settings-v3.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').trim().toLowerCase();
let user=null,profile=null,people=[],invites=[],tab='inicio';
const isAdmin=()=>user?.uid===ADMIN_UID;
const notice=s=>{$('feedback').textContent=s};
const personName=id=>people.find(p=>p.uid===id)?.name||'Conta pendente';
async function load(){
  const snap=await getDoc(doc(db,'profiles',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:null;
  if(isAdmin()){
    const [p,i]=await Promise.all([getDocs(collection(db,'profiles')),getDocs(collection(db,'invitations'))]);
    people=p.docs.map(d=>({uid:d.id,...d.data()}));invites=i.docs.map(d=>({email:d.id,...d.data()}));
  }else{people=profile?[profile]:[];invites=[];}
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
 const allowed=isAdmin()?['inicio','pessoas','tarefas','aprovações','recompensas']:['inicio'];
 if(!allowed.includes(tab))tab='inicio';
 $('tabs').innerHTML=allowed.map(t=>`<button class="${tab===t?'':'alt'}" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('');
 $('screen').innerHTML=tab==='pessoas'?members():tab==='inicio'?home():`<h2>${esc(tab)}</h2><p class="muted">Esta área será ativada depois de concluirmos as permissões e o sistema de pontos. Não são atribuídos nem descontados pontos nesta versão.</p>`;
}
function home(){
 if(!isAdmin())return `<h2>Bem-vindo à Missão+</h2><p>${!profile?'Ainda não existe um convite para este email. Pede ao administrador que te adicione.':profile.status==='pending'?'A tua conta foi criada. Aguarda a autorização do administrador.':profile.role==='guardian'?'Conta de encarregado ativa. As funcionalidades de gestão dos filhos serão ativadas numa próxima versão.':'Conta de filho ativa. As missões serão disponibilizadas numa próxima versão.'}</p>`;
 const guardians=people.filter(p=>p.role==='guardian'),children=people.filter(p=>p.role==='child');
 return `<h2>O teu painel</h2><div class="grid"><article class="card"><h3>Encarregados</h3><div class="points">${guardians.length}</div></article><article class="card"><h3>Filhos</h3><div class="points">${children.length}</div></article><article class="card"><h3>Contas por autorizar</h3><div class="points">${people.filter(p=>p.status==='pending').length}</div></article></div><p>Começa por <b>Pessoas</b>: convida os encarregados, autoriza as contas e só depois adiciona os filhos.</p>`;
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
$('screen').addEventListener('submit',async e=>{if(!['guardianForm','childForm'].includes(e.target.id))return;e.preventDefault();try{await invite(e.target,e.target.id==='guardianForm'?'guardian':'child')}catch(err){notice(err.message)}});
$('screen').addEventListener('click',async e=>{const btn=e.target.closest('[data-action]');if(!btn||!isAdmin())return;try{btn.disabled=true;if(btn.dataset.action==='approve')await updateDoc(doc(db,'profiles',btn.dataset.id),{status:'active',approvedBy:user.uid,approvedAt:serverTimestamp()});if(btn.dataset.action==='deleteInvite')await deleteDoc(doc(db,'invitations',btn.dataset.id));await load();render();notice('Alteração guardada.')}catch(err){notice(err.message);btn.disabled=false}});
onAuthStateChanged(auth,async current=>{user=current;profile=null;people=[];invites=[];try{if(user){await bootstrap();await load();}render();}catch(err){render();notice('Erro ao carregar os dados: '+err.message)}});
