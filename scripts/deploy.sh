#!/usr/bin/env bash
# Deploy do Sistema CCBJ — atualiza deployment existente preservando URL permanente.
# Uso: ./scripts/deploy.sh
set -e

DEPLOYMENT_ID="AKfycbwP-0_0h8c4_c3UnDEEYt_TpzbmOI2DBgNzqUipOOH9VFpyHxDgNqT7G-GZSHV4t9Vz6A"
DESC="v$(date +%Y%m%d-%H%M)"

echo "==> Enviando arquivos para o GAS (clasp push)..."
clasp push

echo "==> Atualizando deployment: ${DEPLOYMENT_ID}"
clasp deploy --deploymentId "${DEPLOYMENT_ID}" --description "${DESC}"

echo ""
echo "✅ Deploy concluído: ${DESC}"
echo "   URL: https://script.google.com/a/macros/idm.org.br/s/${DEPLOYMENT_ID}/exec"
