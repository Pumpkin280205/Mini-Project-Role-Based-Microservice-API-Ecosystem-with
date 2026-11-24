require('dotenv').config();
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
const TXN_FILE = '/app/data/transactions.json';
const QUEUE = 'transactions';
let channel = null;

function loadTxns() {
  try { return JSON.parse(fs.readFileSync(TXN_FILE, 'utf8')); } catch { return []; }
}
function saveTxns(txns) { fs.writeFileSync(TXN_FILE, JSON.stringify(txns, null, 2)); }

function connectRabbit(retries = 0) {
  return amqp.connect(RABBIT_URL).then(conn => conn.createChannel()).then(ch => {
    channel = ch;
    return ch.assertQueue(QUEUE, { durable: true }).then(() => channel);
  }).then(ch => ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const txn = JSON.parse(msg.content.toString());
    txn.user = txn.user || 'unknown';
    txn.status = 'processed';
    txn.processedAt = new Date().toISOString();
    const txns = loadTxns();
    txns.push(txn);
    saveTxns(txns);
    console.log(`processed ${txn.id} $${txn.amount} ${txn.currency}`);
    ch.ack(msg);
  }, { noAck: false }))
  .catch(e => {
    console.error(`worker connect failed (retry ${retries + 1})`, e.message);
    if (retries >= 30) { console.error('giving up on rabbitmq'); process.exit(1); }
    return new Promise(r => setTimeout(r, 1000)).then(() => connectRabbit(retries + 1));
  });
}
connectRabbit();
