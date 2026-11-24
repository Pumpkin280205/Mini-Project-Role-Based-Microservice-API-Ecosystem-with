require('dotenv').config();
const express = require('express');
const cors = require('cors');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
const TXN_FILE = '/app/data/transactions.json';
const QUEUE = 'transactions';

app.use(cors());
app.use(express.json());

let channel = null;

function loadTxns() {
  try { return JSON.parse(fs.readFileSync(TXN_FILE, 'utf8')); } catch { return []; }
}
function saveTxns(txns) { fs.writeFileSync(TXN_FILE, JSON.stringify(txns, null, 2)); }

app.post('/transactions', async (req, res) => {
  const { amount, currency = 'USD', note } = req.body || {};
  if (!amount || isNaN(Number(amount))) return res.status(400).json({ error: 'valid amount required' });
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let user = 'unknown';
  if (token) {
    try { user = jwt.verify(token, JWT_SECRET).sub; } catch { /* keep 'unknown' */ }
  }
  const txn = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), user, amount: Number(amount), currency, note: note || '', status: 'queued', createdAt: new Date().toISOString() };
  try {
    await channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(txn)), { persistent: true });
    res.status(202).json({ accepted: true, transaction: txn });
  } catch (e) {
    res.status(502).json({ error: 'broker unavailable' });
  }
});

app.get('/transactions/:id', (req, res) => {
  const txn = loadTxns().find(t => t.id === req.params.id);
  if (!txn) return res.status(404).json({ error: 'not found' });
  res.json(txn);
});

app.get('/transactions', (req, res) => {
  let txns = loadTxns();
  if (req.query.mine) txns = txns.filter(t => t.user === req.query.mine);
  res.json(txns);
});

function connectRabbit(retries = 0) {
  return amqp.connect(RABBIT_URL).then(conn => conn.createChannel()).then(ch => {
    channel = ch;
    return ch.assertQueue(QUEUE, { durable: true });
  }).then(() => {
    app.listen(PORT, () => console.log(`transaction-service listening on :${PORT}`));
  }).catch(e => {
    console.error(`rabbitmq connect failed (retry ${retries + 1})`, e.message);
    if (retries >= 30) { console.error('giving up on rabbitmq'); process.exit(1); }
    return new Promise(r => setTimeout(r, 1000)).then(() => connectRabbit(retries + 1));
  });
}
connectRabbit();
