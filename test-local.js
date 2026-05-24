#!/usr/bin/env node
/**
 * test-local.js — Prueba el agente en terminal sin conectar WhatsApp
 * Uso: node test-local.js
 *
 * Solo necesitas ANTHROPIC_API_KEY en .env para correr esta prueba.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Validación mínima ─────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n❌  Falta ANTHROPIC_API_KEY en .env\n');
  process.exit(1);
}

// ── Cargar personalidad y conocimiento ───────────────────────────────────────
const systemPrompt = fs.readFileSync(path.join(__dirname, 'CLAUDE.md'), 'utf8');
const businessKnowledge = fs.readFileSync(
  path.join(__dirname, 'knowledge', 'panksero.md'),
  'utf8'
);
const fullSystem = `${systemPrompt}\n\n---\n\n## Catálogo y datos del negocio\n\n${businessKnowledge}`;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const history = [];

async function chat(userMessage) {
  history.push({ role: 'user', content: userMessage });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: fullSystem,
    messages: history,
  });

  const reply = response.content[0].text;
  history.push({ role: 'assistant', content: reply });
  return reply;
}

// ── Interfaz de terminal ──────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🧪 Prueba local — Panksi (Panksero Agent)');
console.log('  Escribe tu mensaje y presiona Enter.');
console.log('  Escribe "salir" para terminar.');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

function prompt() {
  rl.question('Tú: ', async (input) => {
    const msg = input.trim();
    if (!msg) return prompt();
    if (msg.toLowerCase() === 'salir') {
      console.log('\n¡Hasta luego! 👋\n');
      rl.close();
      return;
    }

    try {
      process.stdout.write('Panksi: ');
      const reply = await chat(msg);
      console.log(reply + '\n');
    } catch (err) {
      console.error('❌ Error:', err.message, '\n');
    }

    prompt();
  });
}

prompt();
