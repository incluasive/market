const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DBF=path.join(__dirname,'db.json');
// === RESEND ===
const RESEND_KEY=process.env.RESEND_API_KEY||'';
const RESEND_FROM=process.env.RESEND_FROM||'KeyHub <onboarding@resend.dev>';
let DB;try{DB=JSON.parse(fs.readFileSync(DBF,'utf8'))}catch(e){DB=null}
const uid=()=>crypto.randomBytes(6).toString('hex');
const hash=s=>crypto.createHash('sha256').update(s+'plati').digest('hex');
const save=()=>fs.writeFileSync(DBF,JSON.stringify(DB,null,2));
if(!DB){
  DB={users:[
    {id:'u1',email:'admin@demo.ru',pass:hash('admin'),name:'Администрация',role:'admin',balance:0,refCode:'ADMIN',referredBy:null,refEarnings:0,blocked:false,createdAt:'2025-01-01'},
    {id:'u2',email:'seller@demo.ru',pass:hash('seller'),name:'GameKeysShop',role:'seller',balance:0,refCode:'GK1',referredBy:null,refEarnings:0,blocked:false,verified:true,createdAt:'2025-01-15'},
    {id:'u3',email:'buyer@demo.ru',pass:hash('buyer'),name:'Покупатель Демо',role:'buyer',balance:5000,refCode:'BUY1',referredBy:null,refEarnings:0,blocked:false,createdAt:'2025-02-01'}
  ],products:[],orders:[],payouts:[],disputes:[],notifications:[],emails:[],events:[],promos:[
    {code:'START10',discount:10,uses:0,limit:1000},{code:'SAVE20',discount:20,uses:0,limit:100}
  ],settings:{commission:0.05,refRate:0.01,minPayout:500,cashbackRate:0.02,refBuyerRate:0.01,emailEnabled:true},sessions:{},seq:1000};
  const seed=[
    ['Cyberpunk 2077 Steam Key',1499,2999,'🌆','Игровые ключи'],
    ['Windows 11 Pro лицензия',890,1990,'🪟','Программное обеспечение'],
    ['Minecraft Java Edition',1299,1699,'🟩','Игровые ключи'],
    ['YouTube Premium 4 месяца',599,899,'📺','Подписки'],
    ['Microsoft Office 2021',1290,2990,'📊','Программное обеспечение'],
    ['Курс Python с нуля',1990,4990,'📚','Обучение'],
    ['EA FC 26 Ultimate',2799,3999,'🎯','Игровые ключи'],
    ['Photoshop плагины',590,1490,'🎨','Программное обеспечение'],
    ['GTA V Premium Edition',990,1990,'🚗','Игровые ключи'],
    ['Discord Nitro 1 месяц',490,890,'💬','Подписки'],
    ['Figma Pro 1 год',3990,8900,'🎯','Программное обеспечение'],
    ['Steam Wallet 1000',1090,0,'💰','Игровые ключи'],
    ['Netflix Premium 1 месяц',690,0,'🎬','Подписки'],
    ['Adobe Photoshop 1 месяц',890,1490,'🎨','Программное обеспечение'],
    ['Spotify Premium 3 месяца',790,1290,'🎵','Подписки'],
    ['Xbox Game Pass Ultimate',2490,3990,'🟢','Подписки']
  ];
  const seller=DB.users[1];
  seed.forEach(([t,price,old,icon,cat])=>{
    const pool=[];for(let i=0;i<8;i++)pool.push('KEY-'+uid().toUpperCase()+'-'+uid().toUpperCase());
    DB.products.push({id:uid(),sellerId:seller.id,seller:seller.name,title:t,desc:t+' — цифровой товар с моментальной выдачей. Активация по ключу, регион РФ.',cat,icon,price,old,type:'key',pool,rating:+(4.5+Math.random()*0.5).toFixed(1),sales:Math.floor(Math.random()*900)+50,status:'approved',tags:['digital'],badge:Math.random()>0.7?'Хит':null,reviews:[],createdAt:Date.now()-Math.floor(Math.random()*10000000)});
  });
  DB.products[0].reviews.push({id:uid(),userId:'u3',user:'Покупатель Демо',rating:5,text:'Ключ активировался сразу, спасибо!',date:'10.01.2026',status:'approved'});
  save();console.log('База создана');
}
const json=(res,d,c)=>{res.writeHead(c||200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(d))};
const cookies=req=>{const r={};(req.headers.cookie||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>0)r[p.slice(0,i).trim()]=p.slice(i+1).trim()});return r};
const auth=req=>{const c=cookies(req);if(!c.session||!DB.sessions[c.session])return null;return DB.users.find(u=>u.id===DB.sessions[c.session])||null};
const readBody=req=>new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch(e){r({})}})});
const pub=u=>u?{id:u.id,name:u.name,email:u.email,role:u.role,balance:u.balance,refCode:u.refCode,refEarnings:u.refEarnings,verified:u.verified,blocked:u.blocked,createdAt:u.createdAt}:null;
const notify=(uid,t)=>{DB.notifications.push({id:DB.seq++,userId:uid,text:t,date:new Date().toLocaleString('ru-RU'),read:false})};
const stripPendingReviews=p=>({...p,reviews:(p.reviews||[]).filter(r=>r.status==='approved')});

/* === EMAIL через Resend === */
async function sendEmail(to,subject,text,type){
  if(!DB.settings.emailEnabled)return;
  const mail={id:DB.seq++,to,subject,text,type:type||'info',date:new Date().toLocaleString('ru-RU'),status:'queued'};
  DB.emails.push(mail);if(DB.emails.length>500)DB.emails=DB.emails.slice(-500);
  if(!RESEND_KEY){
    mail.status='simulated';
    console.log('\n━━━ 📧 EMAIL (симуляция) ━━━');
    console.log('Кому:  '+to);
    console.log('Тема:  '+subject);
    console.log('Текст: '+text);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return;
  }
  try{
    const r=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':'Bearer '+RESEND_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({from:RESEND_FROM,to:[to],subject,text})
    });
    const data=await r.json();
    if(r.ok){mail.status='sent';mail.resendId=data.id;console.log('📧 Email → '+to+' ✓ '+data.id)}
    else{mail.status='error';mail.error=data.message||'unknown';console.log('📧 Email ошибка:',data)}
  }catch(e){mail.status='error';mail.error=e.message;console.log('📧 Email ошибка:',e.message)}
  save();
}
function emailForUser(userId,subject,text,type){const u=DB.users.find(x=>x.id===userId);if(u&&u.email)sendEmail(u.email,subject,text,type);}
function trackEvent(type,productId,userId){DB.events.push({id:DB.seq++,type,productId:productId||null,userId:userId||null,date:Date.now()});if(DB.events.length>10000)DB.events=DB.events.slice(-10000);}

const R={
'POST /api/track':(req,res,b)=>{const u=auth(req);if(b.type&&b.productId)trackEvent(b.type,b.productId,u?u.id:null);save();return json(res,{ok:true})},
'GET /api/seller/funnel':(req,res)=>{
  const u=auth(req);if(!u||u.role!=='seller')return json(res,{error:'Только продавец'},403);
  const mine=DB.products.filter(p=>p.sellerId===u.id);
  const products=mine.map(p=>{
    const views=DB.events.filter(e=>e.type==='view'&&e.productId===p.id).length;
    const carts=DB.events.filter(e=>e.type==='cart'&&e.productId===p.id).length;
    const purchases=DB.orders.filter(o=>o.items.some(i=>i.productId===p.id)).length;
    const conv=carts?((purchases/carts)*100).toFixed(1):(views?((purchases/views)*100).toFixed(1):'0');
    return {id:p.id,title:p.title,icon:p.icon,price:p.price,views,carts,purchases,conv};
  }).sort((a,b)=>b.views-a.views);
  return json(res,{products,totalViews:products.reduce((s,p)=>s+p.views,0),totalCarts:products.reduce((s,p)=>s+p.carts,0),totalPurchases:products.reduce((s,p)=>s+p.purchases,0)});
},
'GET /api/seller/charts':(req,res)=>{
  const u=auth(req);if(!u||u.role!=='seller')return json(res,{error:'Только продавец'},403);
  const S=DB.orders.filter(o=>o.items.some(i=>i.sellerId===u.id));
  const M=DB.products.filter(p=>p.sellerId===u.id);
  // 30 дней: сумма по дням
  const daily=[];
  for(let i=29;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const key=d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
    const sum=S.filter(o=>o.date&&o.date.includes(key)).reduce((s,o)=>s+o.items.filter(it=>it.sellerId===u.id).reduce((a,it)=>a+it.price,0),0);
    const cnt=S.filter(o=>o.date&&o.date.includes(key)).reduce((s,o)=>s+o.items.filter(it=>it.sellerId===u.id).length,0);
    daily.push({date:key,sum,cnt});
  }
  // Категории: выручка
  const catMap={};
  M.forEach(p=>{const rev=p.sales*p.price;catMap[p.cat]=(catMap[p.cat]||0)+rev});
  const categories=Object.entries(catMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  // Топ товаров
  const top=M.map(p=>({id:p.id,title:p.title,icon:p.icon,sales:p.sales,revenue:p.sales*p.price})).sort((a,b)=>b.revenue-a.revenue).slice(0,8);
  return json(res,{daily,categories,top});
},
'POST /api/register':(req,res,b)=>{
  if(!b.email||!b.pass||b.pass.length<4)return json(res,{error:'Проверьте поля'},400);
  if(DB.users.find(u=>u.email===b.email))return json(res,{error:'Email уже занят'},400);
  const refMatch=b.ref?DB.users.find(x=>x.refCode===b.ref):null;
  const u={id:uid(),email:b.email,pass:hash(b.pass),name:b.name||b.email.split('@')[0],role:b.role==='seller'?'seller':'buyer',balance:0,refCode:(b.name||'USER').replace(/\W/g,'').toUpperCase().slice(0,6)+Math.floor(Math.random()*90+10),referredBy:refMatch?b.ref:null,refEarnings:0,blocked:false,createdAt:new Date().toLocaleDateString('ru-RU')};
  DB.users.push(u);
  if(refMatch)notify(refMatch.id,'👥 Новый реферал: '+u.name);
  sendEmail(u.email,'Добро пожаловать в KeyHub!','Здравствуйте, '+u.name+'!\n\nВаш аккаунт создан.\nРоль: '+(u.role==='seller'?'Продавец':'Покупатель')+'\n\nПриятных покупок!','welcome');
  const t=uid();DB.sessions[t]=u.id;save();
  res.setHeader('Set-Cookie','session='+t+'; Path=/; HttpOnly; Max-Age=2592000; SameSite=Lax');
  return json(res,pub(u));
},
'POST /api/login':(req,res,b)=>{
  const u=DB.users.find(x=>x.email===b.email&&x.pass===hash(b.pass));
  if(!u)return json(res,{error:'Неверный email или пароль'},401);
  if(u.blocked)return json(res,{error:'Аккаунт заблокирован'},403);
  const t=uid();DB.sessions[t]=u.id;save();
  res.setHeader('Set-Cookie','session='+t+'; Path=/; HttpOnly; Max-Age=2592000; SameSite=Lax');
  return json(res,pub(u));
},
'POST /api/logout':(req,res)=>{const c=cookies(req);if(c.session)delete DB.sessions[c.session];save();res.setHeader('Set-Cookie','session=; Path=/; Max-Age=0');return json(res,{ok:true})},
'GET /api/me':(req,res)=>json(res,pub(auth(req))),
'POST /api/settings':(req,res,b)=>{const u=auth(req);if(!u)return json(res,{error:'Не авторизован'},401);
  if(b.name)u.name=b.name;
  if(b.newPass&&b.oldPass){if(u.pass!==hash(b.oldPass))return json(res,{error:'Неверный пароль'},400);if(b.newPass.length<4)return json(res,{error:'Короткий пароль'},400);u.pass=hash(b.newPass)}
  save();return json(res,pub(u));
},
'GET /api/referral':(req,res)=>{const u=auth(req);if(!u)return json(res,{error:'Войдите'},401);
  const invited=DB.users.filter(x=>x.referredBy===u.refCode);
  const invitedSales=DB.orders.filter(o=>invited.some(x=>x.id===o.buyerId)).reduce((s,o)=>s+o.total,0);
  return json(res,{refCode:u.refCode,refEarnings:u.refEarnings||0,invited:invited.length,invitedSales,cashbackRate:DB.settings.cashbackRate,refBuyerRate:DB.settings.refBuyerRate});
},
'GET /api/products':(req,res)=>json(res,DB.products.filter(p=>p.status==='approved').map(stripPendingReviews)),
'GET /api/products/mine':(req,res)=>{const u=auth(req);if(!u||u.role!=='seller')return json(res,[]);return json(res,DB.products.filter(p=>p.sellerId===u.id).map(stripPendingReviews))},
'POST /api/products':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='seller')return json(res,{error:'Только для продавцов'},403);
  const pool=(b.pool||'').split('\n').map(s=>s.trim()).filter(Boolean);
  if(!b.title||!b.price||!pool.length)return json(res,{error:'Заполните поля'},400);
  const p={id:uid(),sellerId:u.id,seller:u.name,title:b.title,desc:b.desc||b.title,cat:b.cat||'Игровые ключи',icon:b.icon||'📦',price:+b.price,old:+b.old||+b.price,type:b.type||'key',pool,tags:(b.tags||'').split(',').map(s=>s.trim()).filter(Boolean),rating:5,sales:0,status:'pending',badge:'Новинка',reviews:[],createdAt:Date.now()};
  DB.products.push(p);notify('u1','📦 Новый товар от '+u.name+': '+b.title);
  sendEmail(u.email,'Товар отправлен на модерацию','Товар «'+b.title+'» принят и будет проверен в течение 24 часов.','product');
  save();return json(res,p);
},
'POST /api/products/update':(req,res,b)=>{
  const u=auth(req);if(!u)return json(res,{error:'Не авторизован'},401);
  const p=DB.products.find(x=>x.id===b.id);
  if(!p)return json(res,{error:'Товар не найден'},404);
  if(p.sellerId!==u.id&&u.role!=='admin')return json(res,{error:'Нет доступа'},403);
  if(b.title!==undefined)p.title=b.title;
  if(b.desc!==undefined)p.desc=b.desc;
  if(b.cat!==undefined)p.cat=b.cat;
  if(b.icon!==undefined)p.icon=b.icon;
  if(b.price!==undefined)p.price=+b.price;
  if(b.old!==undefined)p.old=+b.old||+p.price;
  if(b.tags!==undefined)p.tags=String(b.tags).split(',').map(s=>s.trim()).filter(Boolean);
  if(b.addKeys){
    const keys=String(b.addKeys).split('\n').map(s=>s.trim()).filter(Boolean);
    p.pool=p.pool.concat(keys);
  }
  if(b.removeKey!==undefined){const idx=+b.removeKey;if(idx>=0&&idx<p.pool.length)p.pool.splice(idx,1)}
  if(u.role==='seller'&&b.requireModeration!==false){p.status='pending';notify('u1','✏️ Товар обновлён: '+p.title)}
  save();return json(res,p);
},
'POST /api/products/delete':(req,res,b)=>{const u=auth(req);if(!u)return json(res,{error:'Не авторизован'},401);
  const p=DB.products.find(x=>x.id===b.id);if(!p)return json(res,{error:'Не найдено'},404);
  if(p.sellerId!==u.id&&u.role!=='admin')return json(res,{error:'Нет доступа'},403);
  DB.products=DB.products.filter(x=>x.id!==b.id);save();return json(res,{ok:true});
},
'POST /api/orders':(req,res,b)=>{
  const u=auth(req);if(!u)return json(res,{error:'Войдите'},401);
  const ids=b.ids||[];const items=[];let total=0;
  for(const id of ids){const p=DB.products.find(x=>x.id===id);if(!p||!p.pool.length)continue;const item=p.pool.shift();p.sales++;items.push({productId:p.id,title:p.title,price:p.price,item,seller:p.seller,sellerId:p.sellerId});total+=p.price;trackEvent('purchase',p.id,u.id)}
  if(!items.length)return json(res,{error:'Пустая корзина'},400);
  let discount=0;
  if(b.promo){const pr=DB.promos.find(x=>x.code===b.promo);if(pr&&(!pr.limit||pr.uses<pr.limit)){discount=Math.round(total*pr.discount/100);pr.uses++}}
  const final=total-discount;
  if(u.balance<final)return json(res,{error:'Недостаточно средств'},400);
  u.balance-=final;
  for(const it of items){const s=DB.users.find(x=>x.id===it.sellerId);if(s){const inc=it.price-Math.round(it.price*DB.settings.commission);s.balance+=inc;notify(s.id,'💰 Продажа: '+it.title+' +'+inc+' ₽');emailForUser(s.id,'Новая продажа','Товар: '+it.title+'\nСумма: '+inc+' ₽ зачислена на баланс.','sale')}}
  const cashback=Math.round(final*DB.settings.cashbackRate);
  if(cashback>0){u.balance+=cashback;notify(u.id,'💸 Кэшбэк за покупку: +'+cashback+' ₽')}
  let refBonus=0;
  if(u.referredBy){const ref=DB.users.find(x=>x.refCode===u.referredBy);if(ref){refBonus=Math.round(final*DB.settings.refBuyerRate);ref.refEarnings=(ref.refEarnings||0)+refBonus;ref.balance+=refBonus;notify(ref.id,'👥 Бонус с покупки '+u.name+': +'+refBonus+' ₽')}}
  const ord={id:DB.seq++,buyerId:u.id,buyerName:u.name,items,total:final,discount,cashback,refBonus,commission:Math.round(final*DB.settings.commission),status:'paid',date:new Date().toLocaleString('ru-RU'),reviewed:false};
  DB.orders.push(ord);notify(u.id,'✓ Заказ #'+ord.id+' оплачен');
  sendEmail(u.email,'Заказ #'+ord.id+' оплачен','Спасибо за покупку!\n\nСостав:\n'+items.map(i=>'• '+i.title+' — '+i.price+' ₽').join('\n')+'\n\nКэшбэк: '+cashback+' ₽','order');
  save();return json(res,ord);
},
'GET /api/orders':(req,res)=>{const u=auth(req);if(!u)return json(res,[]);return json(res,DB.orders.filter(o=>o.buyerId===u.id).reverse())},
'GET /api/orders/sold':(req,res)=>{const u=auth(req);if(!u)return json(res,[]);return json(res,DB.orders.filter(o=>o.items.some(i=>i.sellerId===u.id)).reverse())},
'POST /api/topup':(req,res,b)=>{const u=auth(req);if(!u)return json(res,{error:'Войдите'},401);const s=+b.sum||0;if(s<100)return json(res,{error:'Минимум 100 ₽'},400);u.balance+=s;notify(u.id,'💳 Баланс пополнен на '+s+' ₽');sendEmail(u.email,'Баланс пополнен','Зачислено '+s+' ₽. Текущий баланс: '+u.balance+' ₽.','balance');save();return json(res,{balance:u.balance})},
'POST /api/payouts':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='seller')return json(res,{error:'Только для продавцов'},403);
  const s=+b.sum||0;
  if(s<DB.settings.minPayout)return json(res,{error:'Минимум '+DB.settings.minPayout+' ₽'},400);
  if(s>u.balance)return json(res,{error:'Недостаточно средств'},400);
  u.balance-=s;DB.payouts.push({id:DB.seq++,sellerId:u.id,seller:u.name,amount:s,status:'pending',date:new Date().toLocaleString('ru-RU')});
  notify('u1','💸 Заявка на вывод от '+u.name+': '+s+' ₽');
  sendEmail(u.email,'Заявка на вывод создана','Заявка на '+s+' ₽ принята.','payout');
  save();return json(res,{ok:true});
},
'GET /api/payouts':(req,res)=>{const u=auth(req);if(!u)return json(res,[]);return json(res,DB.payouts.filter(p=>p.sellerId===u.id).reverse())},
'POST /api/disputes':(req,res,b)=>{const u=auth(req);if(!u)return json(res,{error:'Войдите'},401);
  const o=DB.orders.find(x=>x.id===b.orderId);if(!o)return json(res,{error:'Заказ не найден'},404);
  if(o.buyerId!==u.id)return json(res,{error:'Нет доступа'},403);
  const d={id:DB.seq++,orderId:o.id,buyerId:u.id,buyerName:u.name,title:o.items[0].title,reason:b.reason||'Другое',text:b.text||'',status:'open',date:new Date().toLocaleString('ru-RU')};
  DB.disputes.push(d);o.status='disputed';notify('u1','⚠️ Спор #'+o.id+' от '+u.name);
  sendEmail(u.email,'Спор открыт','Спор по заказу #'+o.id+' принят.','dispute');
  save();return json(res,d);
},
'GET /api/disputes':(req,res)=>{const u=auth(req);if(!u)return json(res,[]);return json(res,DB.disputes.filter(d=>d.buyerId===u.id))},
'POST /api/review':(req,res,b)=>{const u=auth(req);if(!u)return json(res,{error:'Войдите'},401);
  const o=DB.orders.find(x=>x.id===b.orderId);if(!o)return json(res,{error:'Заказ не найден'},404);
  const p=DB.products.find(x=>x.id===o.items[0].productId);if(!p)return json(res,{error:'Товар не найден'},404);
  p.reviews=p.reviews||[];
  p.reviews.push({id:uid(),userId:u.id,user:u.name,rating:+b.rating||5,text:b.text,date:new Date().toLocaleDateString('ru-RU'),status:'pending',orderId:o.id});
  o.reviewed=true;notify('u1','📝 Новый отзыв на модерации: '+p.title);save();return json(res,{ok:true,pending:true});
},
'GET /api/notifications':(req,res)=>{const u=auth(req);if(!u)return json(res,[]);return json(res,DB.notifications.filter(n=>n.userId===u.id).reverse())},
'POST /api/notifications/read':(req,res)=>{const u=auth(req);if(!u)return json(res,{ok:false});DB.notifications.filter(n=>n.userId===u.id).forEach(n=>n.read=true);save();return json(res,{ok:true})},
'GET /api/settings':(req,res)=>json(res,DB.settings),
'GET /api/promos':(req,res)=>json(res,DB.promos),
'POST /api/promos/add':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);if(DB.promos.find(p=>p.code===b.code))return json(res,{error:'Такой код уже есть'},400);DB.promos.push({code:b.code,discount:+b.discount,uses:0,limit:+b.limit||0});save();return json(res,{ok:true})},
'POST /api/promos/delete':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);DB.promos=DB.promos.filter(p=>p.code!==b.code);save();return json(res,{ok:true})},
'POST /api/admin/settings':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);
  if(b.commission!==undefined)DB.settings.commission=+b.commission;
  if(b.refRate!==undefined)DB.settings.refRate=+b.refRate;
  if(b.minPayout!==undefined)DB.settings.minPayout=+b.minPayout;
  if(b.cashbackRate!==undefined)DB.settings.cashbackRate=+b.cashbackRate;
  if(b.refBuyerRate!==undefined)DB.settings.refBuyerRate=+b.refBuyerRate;
  if(b.emailEnabled!==undefined)DB.settings.emailEnabled=!!b.emailEnabled;
  save();return json(res,{ok:true});
},
'GET /api/admin/emails':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);return json(res,(DB.emails||[]).slice().reverse())},
'POST /api/admin/emails/clear':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);DB.emails=[];save();return json(res,{ok:true})},
'POST /api/admin/test-email':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);sendEmail(b.to||'test@keyhub.io','Тестовое письмо','Это тестовое сообщение от KeyHub.','test');save();return json(res,{ok:true})},
'GET /api/admin/stats':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);
  let pendingReviews=0;DB.products.forEach(p=>{(p.reviews||[]).forEach(r=>{if(r.status==='pending')pendingReviews++})});
  const sent=(DB.emails||[]).filter(e=>e.status==='sent').length;
  const sim=(DB.emails||[]).filter(e=>e.status==='simulated').length;
  const err=(DB.emails||[]).filter(e=>e.status==='error').length;
  return json(res,{users:DB.users.length,products:DB.products.length,orders:DB.orders.length,revenue:DB.orders.reduce((s,o)=>s+o.total,0),commission:DB.orders.reduce((s,o)=>s+o.commission,0),pendingProducts:DB.products.filter(p=>p.status==='pending').length,pendingPayouts:DB.payouts.filter(p=>p.status==='pending').length,openDisputes:DB.disputes.filter(d=>d.status==='open').length,pendingReviews,totalCashback:DB.orders.reduce((s,o)=>s+(o.cashback||0),0),totalRef:DB.orders.reduce((s,o)=>s+(o.refBonus||0),0),emailsSent:sent,emailsSim:sim,emailsErr:err,resendConfigured:!!RESEND_KEY});
},
'GET /api/admin/users':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);return json(res,DB.users.map(x=>({id:x.id,name:x.name,email:x.email,role:x.role,balance:x.balance,blocked:x.blocked,verified:x.verified,createdAt:x.createdAt})))},
'POST /api/admin/users/block':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);const t=DB.users.find(x=>x.id===b.id);if(!t||t.role==='admin')return json(res,{error:'Нельзя'},400);t.blocked=!t.blocked;save();return json(res,{blocked:t.blocked})},
'GET /api/admin/products':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);return json(res,DB.products.map(p=>({id:p.id,title:p.title,icon:p.icon,price:p.price,seller:p.seller,sellerId:p.sellerId,status:p.status,sales:p.sales,rating:p.rating,pool:p.pool.length,pendingReviews:(p.reviews||[]).filter(r=>r.status==='pending').length})))},
'POST /api/admin/products/approve':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);const p=DB.products.find(x=>x.id===b.id);if(!p)return json(res,{error:'Не найдено'},404);p.status=b.approve?'approved':'rejected';const s=DB.users.find(x=>x.id===p.sellerId);
  if(s){notify(s.id,b.approve?'✓ Товар «'+p.title+'» одобрен':'✕ Товар «'+p.title+'» отклонён');sendEmail(s.email,b.approve?'Товар одобрен':'Товар отклонён','Товар «'+p.title+'» '+(b.approve?'успешно прошёл модерацию.':'отклонён модератором.'),'moderation')}
  save();return json(res,{ok:true})},
'GET /api/admin/orders':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);return json(res,DB.orders.slice().reverse())},
'GET /api/admin/payouts':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);return json(res,DB.payouts.slice().reverse())},
'POST /api/admin/payouts/resolve':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);const p=DB.payouts.find(x=>x.id===b.id);if(!p||p.status!=='pending')return json(res,{error:'Не найдено'},404);
  if(b.approve){p.status='paid';notify(p.sellerId,'💸 Выплата '+p.amount+' ₽ выполнена');emailForUser(p.sellerId,'Выплата выполнена','Выплата '+p.amount+' ₽ отправлена.','payout')}
  else{p.status='rejected';const s=DB.users.find(x=>x.id===p.sellerId);if(s)s.balance+=p.amount;notify(p.sellerId,'✕ Выплата отклонена');emailForUser(p.sellerId,'Выплата отклонена','Заявка на '+p.amount+' ₽ отклонена.','payout')}
  save();return json(res,{ok:true})},
'GET /api/admin/disputes':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);return json(res,DB.disputes)},
'POST /api/admin/disputes/resolve':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);const d=DB.disputes.find(x=>x.id===b.id);if(!d)return json(res,{error:'Не найдено'},404);d.status=b.winner==='buyer'?'resolved_buyer':'resolved_seller';const o=DB.orders.find(x=>x.id===d.orderId);
  if(b.winner==='buyer'&&o){const buyer=DB.users.find(x=>x.id===o.buyerId);if(buyer)buyer.balance+=o.total;o.status='refunded';notify(d.buyerId,'✓ Спор решён в вашу пользу');emailForUser(d.buyerId,'Спор решён','Спор #'+d.id+' удовлетворён.','dispute')}
  else{if(o)o.status='paid';notify(d.buyerId,'✕ Спор отклонён');emailForUser(d.buyerId,'Спор отклонён','Спор #'+d.id+' решён в пользу продавца.','dispute')}
  save();return json(res,{ok:true})},
'GET /api/admin/reviews':(req,res)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);
  const list=[];DB.products.forEach(p=>{(p.reviews||[]).forEach(r=>{if(r.status==='pending')list.push({id:r.id,productId:p.id,productTitle:p.title,productIcon:p.icon,user:r.user,userId:r.userId,rating:r.rating,text:r.text,date:r.date,orderId:r.orderId})})});
  return json(res,list.reverse());
},
'POST /api/admin/reviews/resolve':(req,res,b)=>{const u=auth(req);if(!u||u.role!=='admin')return json(res,{error:'Только админ'},403);
  const p=DB.products.find(x=>x.id===b.productId);if(!p)return json(res,{error:'Товар не найден'},404);
  const r=(p.reviews||[]).find(x=>x.id===b.id);if(!r)return json(res,{error:'Отзыв не найден'},404);
  if(b.approve){r.status='approved';const approved=p.reviews.filter(x=>x.status==='approved');p.rating=approved.length?+(approved.reduce((s,x)=>s+x.rating,0)/approved.length).toFixed(1):5.0;if(r.userId){notify(r.userId,'✓ Ваш отзыв на «'+p.title+'» опубликован');emailForUser(r.userId,'Отзыв опубликован','Ваш отзыв на «'+p.title+'» опубликован.','review')}}
  else{r.status='rejected';if(r.userId){notify(r.userId,'✕ Ваш отзыв на «'+p.title+'» отклонён');emailForUser(r.userId,'Отзыв отклонён','Ваш отзыв на «'+p.title+'» отклонён.','review')}}
  save();return json(res,{ok:true});
}
};

const MANIFEST={name:'KeyHub — маркетплейс цифровых товаров',short_name:'KeyHub',description:'Игры, подписки, ключи, ПО',start_url:'/',scope:'/',display:'standalone',background_color:'#0f1420',theme_color:'#4f7cff',orientation:'portrait',lang:'ru',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'},{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'maskable'}]};
const ICON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7cff"/><stop offset="1" stop-color="#37c978"/></linearGradient></defs><rect width="512" height="512" rx="96" fill="url(#g)"/><text x="50%" y="56%" font-size="340" font-family="Arial,sans-serif" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="middle">K</text></svg>';
const SW=`const CACHE='keyhub-v6';const ASSETS=['/','/manifest.json','/icon.svg'];self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})));self.skipWaiting()});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;if(u.pathname.startsWith('/api/'))return;e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const c=r.clone();caches.open(CACHE).then(ch=>ch.put(e.request,c).catch(()=>{}))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))))});self.addEventListener('push',e=>{let d={title:'KeyHub',body:'Новое уведомление'};try{if(e.data)d=e.data.json()}catch(x){}e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'/icon.svg'}))});self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.openWindow('/'))});`;

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0];const key=req.method+' '+url;
  if(url==='/manifest.json'){res.writeHead(200,{'Content-Type':'application/manifest+json; charset=utf-8'});return res.end(JSON.stringify(MANIFEST))}
  if(url==='/sw.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Service-Worker-Allowed':'/'});return res.end(SW)}
  if(url==='/icon.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8'});return res.end(ICON)}
  if(url.startsWith('/api/')){const b=req.method==='POST'?await readBody(req):{};try{if(R[key])return R[key](req,res,b);return json(res,{error:'Not found'},404)}catch(e){console.error(e);return json(res,{error:e.message},500)}}
  let f=url==='/'?'/index.html':url;f=f.split('..').join('');
  fs.readFile(path.join(__dirname,f),(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'}[path.extname(f)]||'text/plain; charset=utf-8';res.writeHead(200,{'Content-Type':mime});res.end(data)});
}).listen(PORT,'0.0.0.0',()=>{
  console.log('\n=========================================');
  console.log('  KeyHub сервер запущен');
  console.log('  http://localhost:'+PORT);
  console.log('\n  admin@demo.ru / admin');
  console.log('  seller@demo.ru / seller');
  console.log('  buyer@demo.ru / buyer');
  console.log('\n  📧 Email: '+(RESEND_KEY?'✅ Resend подключён':'⚠️ симуляция (без RESEND_API_KEY)'));
  console.log('=========================================\n');
});