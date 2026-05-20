# Procedimento de Deploy — Sistema CCBJ

## URL permanente do sistema

```
https://script.google.com/macros/s/AKfycbxgRSzteN4178H4SROM8nLinARCjP8-QgqCXwVfYnxgYcHjh0r-LGlqhmLPnMBpmoGqiA/exec
```

**Esta URL é vinculada ao Deployment ID, não ao projeto.**  
Nunca use `clasp deploy` sem `--deploymentId` — isso cria uma nova URL.

---

## Deployment ID fixo

```
AKfycbxgRSzteN4178H4SROM8nLinARCjP8-QgqCXwVfYnxgYcHjh0r-LGlqhmLPnMBpmoGqiA
```

---

## Fluxo correto de deploy

### 1. Autenticar no clasp (uma vez)
```bash
clasp login
```

### 2. Subir arquivos para o GAS (não altera URL)
```bash
clasp push
```

### 3. Atualizar o deployment existente (preserva URL)
```bash
clasp deploy \
  --deploymentId AKfycbxgRSzteN4178H4SROM8nLinARCjP8-QgqCXwVfYnxgYcHjh0r-LGlqhmLPnMBpmoGqiA \
  --description "v$(date +%Y%m%d-%H%M)"
```

### Atalho via script
```bash
./scripts/deploy.sh
```

---

## Script `scripts/deploy.sh`

```bash
#!/usr/bin/env bash
set -e

DEPLOYMENT_ID="AKfycbxgRSzteN4178H4SROM8nLinARCjP8-QgqCXwVfYnxgYcHjh0r-LGlqhmLPnMBpmoGqiA"
DESC="v$(date +%Y%m%d-%H%M)"

echo "==> Enviando arquivos para o GAS..."
clasp push

echo "==> Atualizando deployment: $DEPLOYMENT_ID"
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$DESC"

echo "✅ Deploy concluído: $DESC"
echo "   URL: https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
```

---

## O que NÃO fazer

| Comando | Efeito |
|---|---|
| `clasp deploy` | ❌ Cria NOVO deployment com NOVA URL |
| `clasp deploy --description "..."` | ❌ Cria NOVO deployment com NOVA URL |
| Botão "New deployment" no editor GAS | ❌ Cria NOVO deployment com NOVA URL |

---

## Verificar deployments existentes
```bash
clasp deployments
```

---

## Configuração do `appsscript.json`

```json
{
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  }
}
```

- `executeAs: USER_DEPLOYING` ("Execute as: Me") — planilhas protegidas, script roda com credenciais do dono
- `access: ANYONE` — qualquer usuário pode acessar a URL (autenticação controlada pelo sistema)

---

## Troubleshooting

**"clasp: command not found"**
```bash
npm install -g @google/clasp
```

**"Error: Could not find credentials"**
```bash
clasp login
```

**"Deployment not found"**  
Verificar se o `deploymentId` está correto via `clasp deployments`.

**App mostra versão antiga após deploy**  
O GAS tem cache de 5 minutos. Aguardar ou forçar refresh com `?t=$(date +%s)` na URL.
