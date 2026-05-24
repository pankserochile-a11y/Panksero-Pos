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
  echo "    Edita el archivo .env con tus credenciales reales."
  exit 1
fi

# Cargar variables ignorando líneas de comentario y vacías
# (evita el bug de bash con comentarios inline)
while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
  key="${key// /}"
  value="${value%%#*}"   # corta comentarios inline si los hubiera
  value="${value%"${value##*[! ]}"}"  # trim derecho
  export "$key"="$value"
done < .env

# ── Validar credenciales obligatorias ────────────────────────
MISSING=0
declare -A DESCRIPTIONS=(
  [WHATSAPP_TOKEN]="Token de acceso permanente de Meta"
  [WHATSAPP_PHONE_NUMBER_ID]="ID del número de teléfono en Meta"
  [ANTHROPIC_API_KEY]="Clave de la API de Claude (sk-ant-...)"
  [VERIFY_TOKEN]="Token secreto del webhook"
)

for VAR in WHATSAPP_TOKEN WHATSAPP_PHONE_NUMBER_ID ANTHROPIC_API_KEY VERIFY_TOKEN; do
  if [ -z "${!VAR}" ]; then
    echo "⚠️   Falta en .env: $VAR — ${DESCRIPTIONS[$VAR]}"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "👉  Edita el archivo .env, rellena las variables marcadas y vuelve a ejecutar ./start.sh"
  exit 1
fi

# ── Verificar Node.js ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js no está instalado."
  echo "    Instálalo desde https://nodejs.org (se requiere v18+)"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "⚠️   Se requiere Node.js v18 o superior. Versión actual: $(node -v)"
  exit 1
fi

# ── Instalar dependencias si no existen ──────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦  Instalando dependencias (primera vez)..."
  npm install --silent
  echo "✅  Dependencias instaladas"
fi

# ── Lanzar el agente ──────────────────────────────────────────
echo ""
echo "🟢  Panksero WhatsApp Agent iniciando..."
echo "    Puerto  : ${PORT:-3000}"
echo "    Webhook : POST http://localhost:${PORT:-3000}/webhook"
echo "    Health  : GET  http://localhost:${PORT:-3000}/"
echo "    Presiona Ctrl+C para detener"
echo ""

exec node agent.js
