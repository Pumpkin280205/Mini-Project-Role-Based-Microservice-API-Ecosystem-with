require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const USERS_FILE = path.join(__dirname, 'users.json');
const ROLES = ['admin', 'manager', 'customer'];

app.use(cors());
app.use(express.json());

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.post('/register', (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const userRole = role && ROLES.includes(role) ? role : 'customer';
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'username already exists' });
  }
  users.push({ username, password, role: userRole });
  saveUsers(users);
  const token = jwt.sign({ sub: username, role: userRole }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, role: userRole });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ sub: username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role });
});

app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`));
