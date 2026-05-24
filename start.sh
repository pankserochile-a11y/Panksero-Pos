#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start.sh — Arranca el agente WhatsApp de Panksero
# Uso: ./start.sh
# ─────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Verificar .env ────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "❌  No se encontró el archivo .env"
  echo "    Copia .env y rellena las credenciales antes de continuar."
  exit 1
fi

# Cargar variables (para la validación)
set -a; source .env; set +a

# ── Validar credenciales obligatorias ────────────────────────
MISSING=0
for VAR in WHATSAPP_TOKEN WHATSAPP_PHONE_NUMBER_ID ANTHROPIC_API_KEY VERIFY_TOKEN; do
  if [ -z "${!VAR}" ]; then
    echo "⚠️   Variable faltante en .env: $VAR"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "Rellena las variables marcadas en .env y vuelve a ejecutar ./start.sh"
  exit 1
fi

# ── Verificar Node.js ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js no está instalado."
  echo "    Instálalo desde https://nodejs.org (v18+ recomendado)"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "⚠️   Se requiere Node.js v18 o superior. Versión actual: $(node -v)"
  exit 1
fi

# ── Instalar dependencias si no existen ──────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦  Instalando dependencias..."
  npm install
fi

# ── Lanzar el agente ──────────────────────────────────────────
echo ""
echo "🚀  Iniciando Panksero WhatsApp Agent..."
echo "    Presiona Ctrl+C para detener"
echo ""

node agent.js
