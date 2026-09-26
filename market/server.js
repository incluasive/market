const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

let DB = {users: [], products: [], orders: [], sessions: {}};
try {
  if (fs.existsSync(DB_FILE)) DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch(e) { console.error('DB load error:', e.message); }

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
}

function uid() {
  return crypto.randomBytes(6).toString('hex');
}

function hash(s) {
  return crypto.createHash('sha256').update(s + 'salt123').digest('hex');
}

// Первичное заполнение
if (!DB.users.length) {
  DB.users = [
    {id: 'u1', email: 'admin@demo.ru', pass: hash('admin'), name: 'Админ', role: 'admin', balance: 0},
    {id: 'u2', email: 'seller@demo.ru', pass: hash('seller'), name: 'GameKeysShop', role: 'seller', balance: 0},
    {id: 'u3', email: 'buyer@demo.ru', pass: hash('buyer'), name: 'Покупатель', role: 'buyer', balance: 5000}
  ];
  const seed = [
    ['Cyberpunk 2077 Steam Key', 1499, 2999, '🌆', 'keys'],
    ['Windows 11 Pro лицензия', 890, 1990, '🪟', 'soft'],
    ['Minecraft Java Edition', 1299, 1699, '🟩', 'keys'],
    ['YouTube Premium 4 мес', 599, 899, '📺', 'subs'],
    ['Microsoft Office 2021', 1290, 2990, '📊', 'soft'],
    ['Курс Python с нуля', 1990, 4990, '📚', 'learn']
  ];
  DB.products = seed.map(([title, price, old, icon, cat]) => ({
    id: uid(),
    seller: 'GameKeysShop',
    title, price, old, icon, cat,
    desc: title + ' — цифровой товар с мгновенной выдачей после оплаты.',
    pool: ['KEY-' + uid().toUpperCase(), 'KEY-' + uid().toUpperCase(), 'KEY-' + uid().toUpperCase(), 'KEY-' + uid().toUpperCase()],
    rating: +(4.5 + Math.random() * 0.5).toFixed(1),
    sales: Math.floor(Math.random() * 800) + 50,
    status: 'approved'
  }));
  save();
  console.log('База создана, демо-данные загружены.');
}

function json(res, data, code) {
  res.writeHead(code || 200, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const c = req.headers.cookie || '';
  const r = {};
  c.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) r[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return r;
}

function getUser(req) {
  const c = parseCookies(req);
  if (!c.session || !DB.sessions[c.session]) return null;
  return DB.users.find(u => u.id === DB.sessions[c.session]) || null;
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      try { resolve(JSON.parse(b || '{}')); }
      catch(e) { resolve({}); }
    });
  });
}

function publicUser(u) {
  return {id: u.id, name: u.name, email: u.email, role: u.role, balance: u.balance};
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method;

  if (url.startsWith('/api/')) {
    const body = method === 'POST' ? await readBody(req) : {};
    const key = method + ' ' + url;

    try {
      if (key === 'POST /api/register') {
        if (!body.email || !body.pass || body.pass.length < 4) return json(res, {error: 'Проверьте поля'}, 400);
        if (DB.users.find(u => u.email === body.email)) return json(res, {error: 'Email занят'}, 400);
        const u = {
          id: uid(), email: body.email, pass: hash(body.pass),
          name: body.name || body.email.split('@')[0],
          role: body.role === 'seller' ? 'seller' : 'buyer',
          balance: 0
        };
        DB.users.push(u);
        const t = uid();
        DB.sessions[t] = u.id;
        save();
        res.setHeader('Set-Cookie', 'session=' + t + '; Path=/; HttpOnly; Max-Age=2592000');
        return json(res, publicUser(u));
      }

      if (key === 'POST /api/login') {
        const u = DB.users.find(x => x.email === body.email && x.pass === hash(body.pass));
        if (!u) return json(res, {error: 'Неверный email или пароль'}, 401);
        const t = uid();
        DB.sessions[t] = u.id;
        save();
        res.setHeader('Set-Cookie', 'session=' + t + '; Path=/; HttpOnly; Max-Age=2592000');
        return json(res, publicUser(u));
      }

      if (key === 'POST /api/logout') {
        const c = parseCookies(req);
        if (c.session) delete DB.sessions[c.session];
        save();
        res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
        return json(res, {ok: true});
      }

      if (key === 'GET /api/me') {
        const u = getUser(req);
        return json(res, u ? publicUser(u) : null);
      }

      if (key === 'GET /api/products') {
        return json(res, DB.products.filter(p => p.status === 'approved'));
      }

      if (key === 'POST /api/products') {
        const u = getUser(req);
        if (!u || u.role !== 'seller') return json(res, {error: 'Только для продавцов'}, 403);
        const pool = (body.pool || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!body.title || !body.price || !pool.length) return json(res, {error: 'Заполните поля'}, 400);
        const p = {
          id: uid(), seller: u.name, title: body.title,
          price: +body.price, old: +body.old || +body.price,
          icon: body.icon || '📦', cat: body.cat || 'keys',
          desc: body.desc || body.title, pool,
          rating: 5.0, sales: 0, status: 'approved'
        };
        DB.products.push(p);
        save();
        return json(res, p);
      }

      if (key === 'POST /api/orders') {
        const u = getUser(req);
        if (!u) return json(res, {error: 'Войдите в аккаунт'}, 401);
        const ids = body.ids || [];
        const items = [];
        let total = 0;
        for (const id of ids) {
          const p = DB.products.find(x => x.id === id);
          if (!p || !p.pool.length) continue;
          const item = p.pool.shift();
          p.sales++;
          items.push({productId: p.id, title: p.title, price: p.price, item, seller: p.seller});
          total += p.price;
        }
        if (!items.length) return json(res, {error: 'Пустая корзина'}, 400);
        if (u.balance < total) return json(res, {error: 'Недостаточно средств'}, 400);
        u.balance -= total;
        for (const it of items) {
          const s = DB.users.find(x => x.name === it.seller && x.role === 'seller');
          if (s) s.balance += Math.round(it.price * 0.95);
        }
        const ord = {
          id: uid(), buyerId: u.id, buyerName: u.name,
          items, total, date: new Date().toISOString()
        };
        DB.orders.push(ord);
        save();
        return json(res, ord);
      }

      if (key === 'GET /api/orders') {
        const u = getUser(req);
        if (!u) return json(res, []);
        return json(res, DB.orders.filter(o => o.buyerId === u.id).reverse());
      }

      if (key === 'POST /api/topup') {
        const u = getUser(req);
        if (!u) return json(res, {error: 'Войдите'}, 401);
        const sum = +body.sum || 0;
        if (sum < 100) return json(res, {error: 'Минимум 100 ₽'}, 400);
        u.balance += sum;
        save();
        return json(res, {balance: u.balance});
      }

      return json(res, {error: 'Not found'}, 404);
    } catch(e) {
      console.error(e);
      return json(res, {error: e.message}, 500);
    }
  }

  // Статика
  let file = url === '/' ? '/index.html' : url;
  file = file.split('..').join('');
  const fp = path.join(__dirname, file);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8'
    }[path.extname(fp)] || 'text/plain; charset=utf-8';
    res.writeHead(200, {'Content-Type': mime});
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('=========================================');
  console.log('  Сервер запущен!');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('  admin@demo.ru / admin');
  console.log('  seller@demo.ru / seller');
  console.log('  buyer@demo.ru / buyer');
  console.log('=========================================');
  console.log('');
});