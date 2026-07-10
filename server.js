const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_FILE = path.join(ROOT, 'homework-data.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']);
const ALLOWED_STATUSES = new Set(['New', 'Practice', 'Revision', 'Important']);
const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function ensureStorage() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const seed = [
      {
        id: crypto.randomUUID(),
        classGroup: '5-8',
        classLabel: 'Class 5-8',
        subject: 'Maths',
        title: 'Mathematics Practice Sheet',
        details: 'Complete exercise questions on fractions and decimals. Revise examples discussed in class.',
        givenDate: '2026-07-02',
        dueDate: '2026-07-03',
        status: 'New',
        attachmentName: '',
        attachmentUrl: '',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        classGroup: '9-10',
        classLabel: 'Class 9-10',
        subject: 'Science',
        title: 'Science Chapter Revision',
        details: "Prepare short notes from today's topic and solve the back exercise questions.",
        givenDate: '2026-07-02',
        dueDate: '2026-07-04',
        status: 'New',
        attachmentName: '',
        attachmentUrl: '',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        classGroup: '11-12',
        classLabel: 'Class 11-12',
        subject: 'Physics',
        title: 'Physics Numericals',
        details: 'Solve the assigned numerical problems and mark doubts for the next class.',
        givenDate: '2026-07-02',
        dueDate: '2026-07-05',
        status: 'Practice',
        attachmentName: '',
        attachmentUrl: '',
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
}

function readHomework() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeHomework(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, {
  'Content-Type': type,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  'Access-Control-Allow-Origin': 'https://www.upliftcareerinstitute.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',

  ...headers
});
  res.end(body);
}

function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', headers);
}

function notFound(res) {
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  const expiresAt = sessions.get(cookies.uplift_session);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(cookies.uplift_session);
    return false;
  }
  return true;
}

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes && !rejected) {
        rejected = true;
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function safeFileName(name) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'attachment';
  return `${base}-${Date.now()}${ext}`;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:(?:"([^"]+)")|([^;]+))/i.exec(contentType || '');
  if (!boundaryMatch) return { fields: {}, files: {} };
  const boundary = Buffer.from('--' + (boundaryMatch[1] || boundaryMatch[2]));
  const fields = {};
  const files = {};
  let start = buffer.indexOf(boundary);

  while (start !== -1) {
    start += boundary.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const header = buffer.slice(start, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const next = buffer.indexOf(boundary, bodyStart);
    if (next === -1) break;
    const bodyEnd = next - 2;
    const body = buffer.slice(bodyStart, Math.max(bodyStart, bodyEnd));
    const nameMatch = /name="([^"]+)"/.exec(header);
    const filenameMatch = /filename="([^"]*)"/.exec(header);

    if (nameMatch) {
      const name = nameMatch[1];
      if (filenameMatch && filenameMatch[1]) {
        files[name] = { filename: filenameMatch[1], data: body };
      } else {
        fields[name] = body.toString('utf8');
      }
    }
    start = next;
  }

  return { fields, files };
}

function classLabel(classGroup) {
  return ({ '5-8': 'Class 5-8', '9-10': 'Class 9-10', '11-12': 'Class 11-12' })[classGroup] || 'Class';
}

async function handleLogin(req, res) {
  const body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}');
  if (body.username === ADMIN_USER && body.password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    const secureCookie = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `uplift_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureCookie}`
    });
    return;
  }
  sendJson(res, 401, { error: 'Invalid username or password' });
}

async function handleAddHomework(req, res) {
  if (!isAuthed(req)) return sendJson(res, 401, { error: 'Login required' });
  const body = await readBody(req);
  const { fields, files } = parseMultipart(body, req.headers['content-type']);
  const required = ['classGroup', 'subject', 'title', 'details', 'givenDate', 'dueDate'];
  if (required.some(key => !String(fields[key] || '').trim())) {
    return sendJson(res, 400, { error: 'Please fill all required fields' });
  }
  if (!['5-8', '9-10', '11-12'].includes(fields.classGroup) || !validDate(fields.givenDate) || !validDate(fields.dueDate)) {
    return sendJson(res, 400, { error: 'Please provide a valid class and dates' });
  }
  if (fields.dueDate < fields.givenDate) {
    return sendJson(res, 400, { error: 'Due date cannot be before the given date' });
  }

  let attachmentName = '';
  let attachmentUrl = '';
  if (files.attachment && files.attachment.data.length) {
    const extension = path.extname(files.attachment.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return sendJson(res, 400, { error: 'Attachments must be PDF, JPG, PNG, DOC, or DOCX files' });
    }
    const filename = safeFileName(files.attachment.filename);
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), files.attachment.data);
    attachmentName = files.attachment.filename;
    attachmentUrl = `/uploads/${filename}`;
  }

  const item = {
    id: crypto.randomUUID(),
    classGroup: fields.classGroup,
    classLabel: classLabel(fields.classGroup),
    subject: fields.subject.trim(),
    title: fields.title.trim(),
    details: fields.details.trim(),
    givenDate: fields.givenDate,
    dueDate: fields.dueDate,
    status: ALLOWED_STATUSES.has(fields.status) ? fields.status : 'New',
    attachmentName,
    attachmentUrl,
    createdAt: new Date().toISOString()
  };

  const items = readHomework();
  items.unshift(item);
  writeHomework(items);
  sendJson(res, 201, item);
}

async function handleDeleteHomework(req, res, id) {
  if (!isAuthed(req)) return sendJson(res, 401, { error: 'Login required' });
  const items = readHomework();
  const item = items.find(entry => entry.id === id);
  if (!item) return sendJson(res, 404, { error: 'Homework not found' });
  const nextItems = items.filter(entry => entry.id !== id);
  writeHomework(nextItems);
  if (item && item.attachmentUrl) {
    const filePath = path.join(ROOT, item.attachmentUrl.replace(/^\//, ''));
    if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  sendJson(res, 200, { ok: true });
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cleanPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.resolve(ROOT, `.${cleanPath}`);
  const rootPrefix = `${ROOT}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) return notFound(res);
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return notFound(res);
    const ext = path.extname(filePath).toLowerCase();
    const isUpload = filePath.startsWith(`${UPLOAD_DIR}${path.sep}`);
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      ...(isUpload ? { 'Content-Disposition': 'attachment' } : {})
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': 'https://www.upliftcareerinstitute.com',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  return res.end();
}
    if (req.method === 'GET' && url.pathname === '/api/homework') return sendJson(res, 200, readHomework());
    if (req.method === 'GET' && url.pathname === '/api/session') return sendJson(res, 200, { loggedIn: isAuthed(req) });
    if (req.method === 'POST' && url.pathname === '/api/login') return handleLogin(req, res);
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const token = parseCookies(req).uplift_session;
      if (token) sessions.delete(token);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'uplift_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }
    if (req.method === 'POST' && url.pathname === '/api/homework') return handleAddHomework(req, res);
    const deleteMatch = url.pathname.match(/^\/api\/homework\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) return handleDeleteHomework(req, res, deleteMatch[1]);
    if (url.pathname.startsWith('/api/')) return notFound(res);
    serveFile(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Server error' });
  }
});

if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_USER and ADMIN_PASSWORD before starting the server.');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`Uplift website running at http://localhost:${PORT}`);
});
