import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// ── Verificar variables críticas al arrancar ──────────────────────────────────
const REQUIRED_VARS = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'ANTHROPIC_API_KEY', 'VERIFY_TOKEN'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error('\n❌ Faltan variables de entorno:', missing.join(', '));
  console.error('   Configúralas en Railway → Variables\n');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cargar personalidad y conocimiento del negocio al iniciar
const systemPrompt = fs.readFileSync(path.join(__dirname, 'CLAUDE.md'), 'utf8');
const businessKnowledge = fs.readFileSync(
  path.join(__dirname, 'knowledge', 'panksero.md'),
  'utf8'
);

// Historial de conversaciones en memoria (por número de teléfono)
const conversations = new Map();
const MAX_HISTORY = 20;

function getHistory(phone) {
  if (!conversations.has(phone)) conversations.set(phone, []);
  return conversations.get(phone);
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

// ── Llamada a Claude ──────────────────────────────────────────────────────────
async function askClaude(phone, userMessage) {
  addToHistory(phone, 'user', userMessage);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `${systemPrompt}\n\n---\n\n## Catálogo y datos del negocio\n\n${businessKnowledge}`,
    messages: getHistory(phone),
  });

  const reply = response.content[0].text;
  addToHistory(phone, 'assistant', reply);
  return reply;
}

// ── Enviar mensaje WhatsApp ───────────────────────────────────────────────────
async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WhatsApp ERROR] status=${res.status} body=${err}`);
    throw new Error(`WhatsApp API ${res.status}: ${err}`);
  }

  console.log(`[WhatsApp OK] Mensaje enviado a ${to}`);
}

// ── Webhook: verificación ─────────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('[Webhook] Verificación exitosa');
    res.status(200).send(challenge);
  } else {
    console.warn(`[Webhook] Token incorrecto: "${token}"`);
    res.sendStatus(403);
  }
});

// ── Webhook: mensajes entrantes ───────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder a Meta inmediatamente

  // Log del payload completo para diagnóstico
  console.log('[Webhook] Payload:', JSON.stringify(req.body, null, 2));

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Ignorar notificaciones de estado (entregado, leído, etc.)
    if (value?.statuses?.length) {
      console.log('[Webhook] Notificación de estado, ignorada');
      return;
    }

    if (!value?.messages?.length) {
      console.log('[Webhook] Sin mensajes en el payload, ignorado');
      return;
    }

    const msg = value.messages[0];
    const from = msg.from;
    const name = value.contacts?.[0]?.profile?.name ?? 'Cliente';

    console.log(`[Mensaje] De: ${name} (${from}) | Tipo: ${msg.type}`);

    if (msg.type !== 'text') {
      await sendWhatsApp(from, 'Por ahora solo puedo leer mensajes de texto. ¿En qué te ayudo? 😊');
      return;
    }

    const userText = msg.text.body.trim();
    console.log(`[Texto] "${userText}"`);

    const reply = await askClaude(from, userText);
    console.log(`[Panksi] "${reply}"`);

    await sendWhatsApp(from, reply);
  } catch (err) {
    console.error('[ERROR]', err.message);
    console.error(err.stack);
  }
});

// ── Health check + estado de variables ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'Panksero WhatsApp Agent',
    version: '1.0.0',
    vars: {
      WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN ? '✅ configurado' : '❌ falta',
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ? '✅ configurado' : '❌ falta',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✅ configurado' : '❌ falta',
      VERIFY_TOKEN: process.env.VERIFY_TOKEN ? '✅ configurado' : '❌ falta',
    },
  });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n🟢 Panksero WhatsApp Agent corriendo en puerto ${PORT}`);
  console.log(`   WHATSAPP_PHONE_NUMBER_ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID}`);
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'sk-ant-***' : '❌ NO CONFIGURADA'}`);
  console.log(`   WHATSAPP_TOKEN: ${process.env.WHATSAPP_TOKEN ? '***configurado***' : '❌ NO CONFIGURADO'}\n`);
});
