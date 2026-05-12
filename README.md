## Pré-requisitos

- Node.js 18+
- npm ou yarn
- Google Chrome instalado (usado pelo WPPConnect para abrir o WhatsApp Web)
- Para mobile: Android Studio + Java 17 (ou Xcode para iOS)

---

## 1. Backend (API)

```bash
cd backend
npm install
# Edite .env se necessário (JWT_SECRET, PORT, etc.)
npm run dev       # desenvolvimento
npm start         # produção
```

A API sobe em `http://localhost:3001`.

---

## 2. Frontend Web (React)

```bash
cd frontend
npm install
npm run dev       # desenvolvimento em http://localhost:5173
npm run build     # build para produção (pasta dist/)
```

---

## 3. Primeiro acesso

Abra `http://localhost:5173`, clique em **"Criar conta"** e preencha:
- **Organização**: nome da sua empresa/tenant
- **Usuário**: será o admin principal
- **Senha**: escolha uma senha forte

---

## 4. Conectar WhatsApp

1. Acesse **Sessões** no menu lateral
2. Clique em **"+ Criar"** e dê um nome à sessão
3. Clique em **"Conectar"** — um QR code aparecerá
4. Abra o WhatsApp no celular → Menu → Dispositivos vinculados → Vincular dispositivo
5. Escaneie o QR code

---

## 5. Funcionalidades

### Moderação automática de grupos
- Acesse **Sessões → Grupos → Gerenciar**
- Ative "Banir por links" e/ou "Banir por palavrão"

### Palavrões proibidos
- Acesse **Configurações → Palavrões**
- Adicione palavras uma a uma ou em massa

### Comandos de texto para admins
- Acesse **Configurações → Comandos**
- Exemplo: crie o trigger `rm` com ação `Remover do grupo`
- No WhatsApp, o admin digita: `rm 5511999999999`

### Bloquear grupo por horário
- Acesse **Sessões → Grupos → Gerenciar → Configurações**
- Ative "Bloquear grupo por horário"
- Configure início, fim e dias da semana
- No horário configurado, o grupo entra em modo "só admins"

### Multitenant
- Cada organização tem seus próprios usuários, sessões e configurações
- Novos tenants se registram em `/register`

---

## 6. Build Mobile (Android)

### Pré-requisito: build do frontend para Cordova

```bash
cd frontend
npm run build:cordova   # gera dist/ com caminhos relativos
```

### Edite a URL da API no mobile

No arquivo `frontend/.env`, configure:
```
VITE_API_URL_MOBILE=http://SEU_IP_OU_DOMINIO:3001/api
```

Faça o build novamente após alterar.

### Build Android

```bash
cd mobile
npm install
npm run build:android   # copia o dist/ e compila o APK
# APK gerado em: mobile/platforms/android/app/build/outputs/apk/debug/
```

### Rodar no dispositivo conectado via USB

```bash
cd mobile
npm run run:android
```

---

## 7. Variáveis de ambiente importantes

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta da API | `3001` |
| `JWT_SECRET` | Segredo JWT (mude em produção!) | — |
| `DB_PATH` | Caminho do banco SQLite | `./data/manager.db` |
| `SESSIONS_PATH` | Pasta de tokens WPPConnect | `./data/sessions` |
| `CORS_ORIGIN` | Origem permitida pelo CORS | `http://localhost:5173` |

---

## 8. Estrutura do projeto

```
manager-whatsapp/
├── backend/          # API Node.js + WPPConnect
│   ├── src/
│   │   ├── index.js
│   │   ├── database.js
│   │   ├── middleware/auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── sessions.js
│   │   │   ├── groups.js
│   │   │   └── settings.js
│   │   └── services/whatsapp.js
│   └── data/         # Banco SQLite + tokens (gerado ao rodar)
├── frontend/         # React + Tailwind (web)
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── contexts/
│       └── services/
└── mobile/           # Apache Cordova (Android/iOS)
    ├── config.xml
    └── scripts/copy-web.js
```
