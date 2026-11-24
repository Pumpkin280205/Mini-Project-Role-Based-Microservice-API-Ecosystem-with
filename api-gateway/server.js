require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const AUTH_URL = process.env.AUTH_URL || 'http://auth-service:3001';
const TXN_URL = process.env.TXN_URL || 'http://transaction-service:3002';
const ROLE_HIERARCHY = { admin: ['admin', 'manager', 'customer'], manager: ['manager', 'customer'], customer: ['customer'] };

app.use(cors());
app.use(express.json());

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'invalid or expired token' }); }
}

function requireRole(allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'forbidden: insufficient role' });
    next();
  };
}

function forward(target, path) {
  return async (req, res) => {
    const downstreamPath = path.replace(/:(\w+)/g, (_, key) => req.params[key] || '');
    try {
      const { data, status } = await axios({
        method: req.method,
        url: `${target}${downstreamPath}`,
        params: req.query,
        headers: req.user ? { authorization: req.headers.authorization } : undefined,
        data: req.method === 'GET' ? undefined : req.body,
        timeout: 10000,
      });
      res.status(status).json(data);
    } catch (e) {
      const status = e.response && e.response.status ? e.response.status : 502;
      res.status(status).json({ error: e.response ? e.response.data.error || e.response.data : e.message });
    }
  };
}

app.post('/auth/register', forward(AUTH_URL, '/register'));
app.post('/auth/login', forward(AUTH_URL, '/login'));

app.post('/transactions', authenticate, requireRole(['admin', 'manager', 'customer']), forward(TXN_URL, '/transactions'));
app.get('/transactions/:id', authenticate, requireRole(['admin', 'manager', 'customer']), forward(TXN_URL, '/transactions/:id'));
app.get('/transactions', authenticate, (req, res, next) => {
  // customers see only their own; admins/managers see all
  if (req.user.role === 'customer') req.query.mine = req.user.sub;
  next();
}, requireRole(['admin', 'manager', 'customer']), forward(TXN_URL, '/transactions'));

app.listen(PORT, () => console.log(`api-gateway listening on :${PORT}`));
