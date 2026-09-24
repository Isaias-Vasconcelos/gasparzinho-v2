# Gasparzinho

Gerenciamento e moderação de grupos do WhatsApp.

A aplicação é **ASP.NET Core MVC** (backend e frontend unificados, views renderizadas
no servidor) mais uma **bridge Node** enxuta que existe só para falar o protocolo do
WhatsApp via Baileys — a única parte que não tem equivalente em .NET.

```
┌─────────────────────────┐   HTTP    ┌──────────────────┐
│   Gasparzinho.Web       │ ────────▶ │  bridge (Node)   │
│   ASP.NET Core MVC      │           │  Baileys         │
│                         │ ◀──────── │  QR, eventos     │
│  Views + Controllers    │  webhook  │  banir / fechar  │
│  EF Core + MySQL        │           │  baixar mídia    │
│  IA (Claude/GPT/Gemini) │           └──────────────────┘
│  Moderação, planos      │
└─────────────────────────┘
```

## Inteligência artificial

Cada cliente informa **o seu provedor, o seu token e os seus prompts** na tela
*Moderação*. São três usos independentes, cada um com o seu prompt editável:

| Uso | O que faz |
|---|---|
| Resposta automática | Responde as mensagens do grupo seguindo o prompt do cliente |
| Palavras de baixo calão | Analisa texto e legendas das mensagens |
| Imagens ilícitas | Analisa imagens, figurinhas e o primeiro quadro dos vídeos |

Provedores aceitos: **Claude (Anthropic)**, **GPT (OpenAI)** e **Gemini (Google)**.

A resposta automática dispara em toda mensagem ou só depois de uma palavra-chave
(`!ia` por padrão), conforme a configuração. O prompt aceita `{grupo}` e
`{usuario}`, resolvidos antes do envio. Ela usa **apenas** o token do cliente —
não há reserva global.

Na moderação a credencial é resolvida nesta ordem:

1. token do próprio cliente, se informado e ativado;
2. token global do superadmin (reserva);
3. nenhum — só a lista literal de palavras continua valendo.

A lista de palavras é sempre checada antes da IA, por ser gratuita e instantânea.
Falha de IA nunca pune por engano: a mensagem é liberada e o erro registrado.

## Remoção por inatividade

Cada grupo gerenciado pode remover automaticamente quem não envia mensagem há um
número de dias definido, com **motivo personalizável** — enviado ao removido no
privado e registrado nos avisos. Administradores nunca são removidos.

A contagem começa quando o membro é visto pela primeira vez pela varredura, então
ninguém sai sem ter tido a chance de interagir. Além do ciclo automático
(`Schedule:InactivityCheckMinutes`), a configuração do grupo tem um botão para
rodar a varredura na hora.

## Requisitos

- .NET SDK 9 (fixado em `global.json`)
- MySQL 8
- Node.js 20+ (apenas para a bridge)

## Configuração

### 1. Aplicação (`src/Gasparzinho.Web`)

Nunca comite segredos — use `dotnet user-secrets` em desenvolvimento e variáveis
de ambiente em produção.

```bash
cd src/Gasparzinho.Web
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:Default" "Server=localhost;Port=3306;Database=gasparzinho;User=root;Password=SUA_SENHA;CharSet=utf8mb4"
dotnet user-secrets set "SuperAdmin:Password" "uma-senha-forte"
dotnet user-secrets set "Bridge:Token" "um-valor-longo-e-aleatorio"
```

Chaves disponíveis:

| Chave | Função |
|---|---|
| `ConnectionStrings:Default` | Conexão MySQL |
| `Database:ServerVersion` | Versão do MySQL. Em branco, é detectada na partida (exige o banco no ar) |
| `Bridge:BaseUrl` | URL da bridge (padrão `http://localhost:3002/`) |
| `Bridge:Token` | Segredo compartilhado com a bridge — **obrigatório**, sem ele os webhooks são recusados |
| `SuperAdmin:Username` | Usuário do administrador da plataforma (padrão `admin`) |
| `SuperAdmin:Password` | Senha inicial. Sem ela, nenhum superadmin é criado |
| `Schedule:TimeZone` | Fuso do bloqueio por horário (padrão `America/Sao_Paulo`) |
| `Schedule:InactivityCheckMinutes` | Intervalo da varredura de inatividade (padrão 60, mínimo 5) |

### 2. Bridge (`bridge/`)

```bash
cd bridge
cp .env.example .env    # ajuste BRIDGE_TOKEN com o MESMO valor do .NET
npm install
```

Aponte `SESSIONS_PATH` para a pasta de sessões existente para **não perder as
conexões já pareadas**.

## Executar

Dois processos, em terminais separados:

```bash
# 1. bridge
cd bridge && npm start

# 2. aplicação
cd src/Gasparzinho.Web && dotnet run
```

O banco é criado e migrado automaticamente na primeira execução.

## Acesso

| Rota | Quem usa |
|---|---|
| `/Account/Login` | Cliente |
| `/Super/Login` | Administrador da plataforma |

Não há cadastro público nem cobrança: o superadmin cria cada cliente em
*Novo cliente*, define o perfil de limite e entrega usuário e senha.

Perfis de limite (`free`, `starter`, `pro`) controlam sessões, grupos e sugestões
diárias de IA. São atribuídos manualmente, sem pagamento envolvido.
