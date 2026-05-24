import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cargar personalidad y conocimiento del negocio al iniciar
const systemPrompt = fs.readFileSync(path.join(__dirname, 'CLAUDE.md'), 'utf8');
const businessKnowledge = fs.readFileSync(
  path.join(__dirname, 'knowledge', 'panksero.md'),
  'utf8'
);

// Historial de conversaciones en memoria (por número de teléfono)
const conversations = new Map();
const MAX_HISTORY = 20; // máximo de mensajes por conversación

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
    console.error(`[WhatsApp] Error enviando a ${to}:`, err);
  }
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
    res.sendStatus(403);
  }
});

// ── Webhook: mensajes entrantes ───────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder a Meta inmediatamente

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return;

    const msg = value.messages[0];
    const from = msg.from;
    const name = value.contacts?.[0]?.profile?.name ?? 'Cliente';

    let userText = '';
    if (msg.type === 'text') {
      userText = msg.text.body.trim();
    } else {
      // Tipos no soportados (audio, imagen, etc.)
      await sendWhatsApp(from, 'Por ahora solo puedo leer mensajes de texto. ¿En qué te ayudo? 😊');
      return;
    }

    console.log(`[${new Date().toLocaleTimeString()}] ${name} (${from}): ${userText}`);

    const reply = await askClaude(from, userText);
    await sendWhatsApp(from, reply);

    console.log(`[Panksi → ${from}]: ${reply}`);
  } catch (err) {
    console.error('[Error procesando mensaje]', err);
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', agent: 'Panksero WhatsApp Agent', version: '1.0.0' });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n🟢 Panksero WhatsApp Agent corriendo en puerto ${PORT}`);
  console.log(`   Webhook: POST /webhook`);
  console.log(`   Health:  GET  /\n`);
});
