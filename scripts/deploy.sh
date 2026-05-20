#!/usr/bin/env bash
# Deploy do Sistema CCBJ — atualiza deployment existente preservando URL permanente.
# Uso: ./scripts/deploy.sh
set -e

DEPLOYMENT_ID="AKfycbxgRSzteN4178H4SROM8nLinARCjP8-QgqCXwVfYnxgYcHjh0r-LGlqhmLPnMBpmoGqiA"
DESC="v$(date +%Y%m%d-%H%M)"

echo "==> Enviando arquivos para o GAS (clasp push)..."
clasp push

echo "==> Atualizando deployment: ${DEPLOYMENT_ID}"
clasp deploy --deploymentId "${DEPLOYMENT_ID}" --description "${DESC}"

echo ""
echo "✅ Deploy concluído: ${DESC}"
echo "   URL: https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
