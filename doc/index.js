require("dotenv").config();

const { chromium } = require("playwright");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_URL = process.env.SYSTEM_URL;
const SYSTEM_USER = process.env.SYSTEM_USER;
const SYSTEM_PASSWORD = process.env.SYSTEM_PASSWORD;

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const OUTPUT_DIR = path.join(__dirname, "output");
const IMAGES_DIR = path.join(OUTPUT_DIR, "images");

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });


// ======================================================
// UTILITÁRIOS
// ======================================================

function slugify(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}


// ======================================================
// 1. EXPLORA O SISTEMA
// ======================================================

async function explorarSistema(page) {

    console.log("\n========================================");
    console.log("EXPLORANDO SISTEMA");
    console.log("========================================\n");

    // --------------------------------------------------
    // LOGIN
    // --------------------------------------------------

    console.log("Acessando sistema...");

    await page.goto(SYSTEM_URL, {
        waitUntil: "networkidle"
    });

    console.log("Fazendo login...");

    /*
        AJUSTE ESTES SELETORES PARA O SEU SISTEMA

        Exemplos:

        #username
        #password
        #btnLogin

        ou:

        input[name="email"]
        input[name="password"]
        button[type="submit"]
    */

    await page.fill("#Username", SYSTEM_USER);
    await page.fill("#Password", SYSTEM_PASSWORD);

    await page.locator("form[action*='Login'] button[type='submit']").click();

    await page.waitForLoadState("networkidle");

    console.log("✓ Login realizado");


    // --------------------------------------------------
    // DESCOBRIR MENU
    // --------------------------------------------------

    console.log("\nProcurando funcionalidades...\n");

    /*
        AJUSTE O SELETOR DO MENU.

        Exemplos:

        aside a
        nav a
        .sidebar a
        .menu a
    */

    const menu = await page.locator("aside a").evaluateAll(elements => {

        return elements.map((element, index) => {

            return {
                index,
                nome: element.innerText.trim(),
                url: element.href
            };

        });

    });

    menu.push({
    index: 4,
    nome: "Configurações Grupo",
    url: "http://localhost:5157/Groups/Settings?sessionId=35f9c566-7110-4c4d-83ce-560ac092815d&groupId=120363427711411860@g.us"
});

    console.log(`Encontradas ${menu.length} opções.`);

    const resultados = [];


    // --------------------------------------------------
    // VISITAR CADA FUNCIONALIDADE
    // --------------------------------------------------

    for (const item of menu) {

        if (!item.nome)
            continue;

        // Ignora links externos
        if (!item.url.startsWith(SYSTEM_URL))
            continue;

        console.log("----------------------------------------");
        console.log(`Explorando: ${item.nome}`);

        try {

            await page.goto(item.url, {
                waitUntil: "networkidle"
            });

            // Espera a interface terminar de renderizar
            await page.waitForTimeout(1000);


            // --------------------------------------------------
            // SCREENSHOT
            // --------------------------------------------------

            const slug = slugify(item.nome);

            const screenshotPath =
                path.join(
                    SCREENSHOTS_DIR,
                    `${slug}.png`
                );

            await page.screenshot({
                path: screenshotPath,
                fullPage: true
            });


            // --------------------------------------------------
            // TEXTO DA PÁGINA
            // --------------------------------------------------

            const texto = await page
                .locator("body")
                .innerText();


            // --------------------------------------------------
            // ARIA SNAPSHOT
            // --------------------------------------------------

            let aria = "";

            try {

                aria = await page
                    .locator("body")
                    .ariaSnapshot();

            } catch {

                aria = "ARIA snapshot indisponível.";

            }


            // --------------------------------------------------
            // COPIAR IMAGEM PARA OUTPUT
            // --------------------------------------------------

            const outputImage =
                path.join(
                    IMAGES_DIR,
                    `${slug}.png`
                );

            fs.copyFileSync(
                screenshotPath,
                outputImage
            );


            resultados.push({

                nome: item.nome,

                url: item.url,

                screenshot: screenshotPath,

                image: `images/${slug}.png`,

                texto,

                aria

            });


            console.log(`✓ Screenshot: ${screenshotPath}`);

        }

        catch (error) {

            console.log(
                `❌ Erro em ${item.nome}: ${error.message}`
            );

        }

    }

    return resultados;
}

// ======================================================
// 4. IA GERA CONTEÚDO PARA INSTAGRAM
// ======================================================

async function gerarConteudoInstagram(funcionalidades) {

    console.log("\n========================================");
    console.log("GERANDO CONTEÚDO PARA INSTAGRAM");
    console.log("========================================\n");

    const dados = JSON.stringify(
        funcionalidades,
        null,
        2
    );

    const prompt = `
Você é um especialista em marketing digital,
social media, copywriting e design para Instagram,
especializado em produtos SaaS.

O sistema se chama MODERAHUB.

Abaixo estão as funcionalidades reais encontradas
automaticamente no sistema:

${dados}


==================================================
OBJETIVO
==================================================

Crie conteúdo para Instagram para divulgar o
ModeraHub e apresentar suas funcionalidades
para potenciais clientes.


==================================================
REGRAS
==================================================

- NÃO invente funcionalidades.
- NÃO invente informações.
- Utilize somente os dados fornecidos.
- Os screenshots representam o sistema real.
- Sempre que possível, utilize o screenshot
  correspondente à funcionalidade.
- O conteúdo deve ser comercial e persuasivo.
- Não utilize linguagem excessivamente técnica.
- Destaque o problema que a funcionalidade resolve.
- Destaque o benefício para o cliente.


==================================================
CRIE 10 POSTS
==================================================

POST 1:
Apresentação do ModeraHub.

POST 2:
Principal problema que o sistema resolve.

POST 3:
Principal funcionalidade.

POST 4:
Segunda funcionalidade mais relevante.

POST 5:
Terceira funcionalidade mais relevante.

POST 6:
Apresentação da interface e experiência do sistema.

POST 7:
Várias funcionalidades em uma única publicação.

POST 8:
Principal diferencial identificado no sistema.

POST 9:
Post transmitindo profissionalismo e confiança.

POST 10:
Post focado em conversão e venda.


==================================================
POST 10 — CTA
==================================================

Convide o usuário para começar a utilizar
o ModeraHub.

O CTA deve direcionar para:

https://w.app/hgczhe

Use uma chamada como:

"Entre em contato e comece a usar"

ou uma variação mais persuasiva.


==================================================
FORMATO
==================================================

As artes devem ser pensadas para Instagram.

Formato:

1080 x 1350 px

Proporção:

4:5


==================================================
DIREÇÃO VISUAL
==================================================

Crie uma identidade visual consistente entre
todos os posts.

Estilo:

- SaaS premium
- Moderno
- Profissional
- Tecnológico
- Minimalista
- Elegante
- Visual limpo
- Tipografia moderna
- Cards
- Bordas arredondadas
- Sombras suaves
- Gradientes discretos
- Elementos tecnológicos sutis


==================================================
SCREENSHOTS
==================================================

Os screenshots são capturas reais do ModeraHub.

Não recrie a interface.

Não invente telas.

Quando um screenshot for utilizado,
mantenha a interface fiel à imagem original.

O screenshot pode ser apresentado dentro de:

- Notebook
- Monitor
- Smartphone
- Card
- Mockup
- Moldura
- Composição publicitária


==================================================
COPYWRITING
==================================================

Os títulos devem ser curtos e fortes.

Evite frases genéricas como:

"Transforme seu negócio"

"Revolucione sua empresa"

"Tenha resultados incríveis"

Prefira frases relacionadas diretamente
às funcionalidades reais.


==================================================
LEGENDA
==================================================

Crie uma legenda completa para cada post.

A legenda deve:

- Complementar a arte
- Explicar o benefício
- Possuir parágrafos curtos
- Ser comercial
- Possuir CTA
- Ser fácil de ler

Quando apropriado, inclua:

https://w.app/hgczhe


==================================================
HASHTAGS
==================================================

Utilize entre 5 e 10 hashtags relevantes.


==================================================
RETORNO
==================================================

Retorne SOMENTE JSON válido.

Não coloque markdown.

Não coloque:

\`\`\`json

nem:

\`\`\`

Formato:

[
    {
        "post": 1,
        "objetivo": "",
        "titulo": "",
        "subtitulo": "",
        "textoImagem": "",
        "cta": "",
        "descricaoVisual": "",
        "screenshot": "",
        "legenda": "",
        "hashtags": []
    }
]

Crie exatamente 10 posts.
`;


    try {

        const response =
            await openai.responses.create({

                model: "gpt-5.6-luna",

                input: prompt

            });


        let textoIA =
            response.output_text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();


        const posts = JSON.parse(textoIA);


        // --------------------------------------------------
        // SALVAR JSON
        // --------------------------------------------------

        const postsPath =
            path.join(
                OUTPUT_DIR,
                "instagram.json"
            );


        fs.writeFileSync(

            postsPath,

            JSON.stringify(
                posts,
                null,
                2
            ),

            "utf8"

        );


        // --------------------------------------------------
        // SALVAR TXT
        // --------------------------------------------------

        let textoInstagram =
            "ModeraHub - POSTS PARA INSTAGRAM\n\n";


        for (const post of posts) {

            textoInstagram += `
==================================================
POST ${post.post}
==================================================

OBJETIVO:
${post.objetivo}

TÍTULO:
${post.titulo}

SUBTÍTULO:
${post.subtitulo}

TEXTO DA IMAGEM:
${post.textoImagem}

CTA:
${post.cta}

SCREENSHOT:
${post.screenshot}

DESCRIÇÃO VISUAL:
${post.descricaoVisual}

LEGENDA:
${post.legenda}

HASHTAGS:
${post.hashtags.join(" ")}

`;
        }


        fs.writeFileSync(

            path.join(
                OUTPUT_DIR,
                "instagram.txt"
            ),

            textoInstagram,

            "utf8"

        );


        console.log(
            `✓ ${posts.length} posts para Instagram criados`
        );

        console.log(
            `✓ JSON: ${postsPath}`
        );

        console.log(
            `✓ TXT: ${path.join(OUTPUT_DIR, "instagram.txt")}`
        );


        return posts;

    }
    catch (error) {

        console.log(
            `❌ Erro ao gerar Instagram: ${error.message}`
        );

        return [];

    }
}


// ======================================================
// 2. IA ANALISA AS TELAS
// ======================================================

async function analisarTelas(resultados) {

    console.log("\n========================================");
    console.log("ANALISANDO TELAS COM IA");
    console.log("========================================\n");


    const funcionalidades = [];


    for (const item of resultados) {

        console.log(`IA analisando: ${item.nome}`);


        const imagemBase64 =
            fs
                .readFileSync(item.screenshot)
                .toString("base64");


        const prompt = `
Você é um especialista em UX, SaaS e copywriting.

Analise esta tela de um sistema real.

NOME DA FUNCIONALIDADE:
${item.nome}

URL:
${item.url}

TEXTO ENCONTRADO:
${item.texto}

ESTRUTURA ARIA:
${item.aria}

Sua tarefa é identificar o que esta funcionalidade realmente faz.

IMPORTANTE:

- Não invente funcionalidades.
- Baseie-se somente na imagem, texto e estrutura fornecidos.
- Escreva pensando em uma landing page comercial.
- Destaque o benefício para o usuário.
- Não mencione que você é uma IA.
- Não fale sobre código.

Retorne SOMENTE JSON válido neste formato:

{
    "nome": "",
    "titulo": "",
    "descricao": "",
    "beneficio": "",
    "recursos": [
        "",
        "",
        ""
    ]
}
`;


        try {

            const response =
                await openai.responses.create({

                    model: "gpt-5.6-luna",

                    input: [

                        {
                            role: "user",

                            content: [

                                {
                                    type: "input_text",
                                    text: prompt
                                },

                                {
                                    type: "input_image",
                                    image_url:
                                        `data:image/png;base64,${imagemBase64}`
                                }

                            ]

                        }

                    ]

                });


            const textoIA =
                response.output_text
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .trim();


            const resultado =
                JSON.parse(textoIA);


            funcionalidades.push({

                ...resultado,

                imagem: item.image

            });


            console.log(`✓ ${item.nome}`);

        }

        catch (error) {

            console.log(
                `❌ Erro na IA: ${error.message}`
            );

        }

    }


    return funcionalidades;
}


// ======================================================
// 3. IA CRIA A LANDING PAGE
// ======================================================

async function gerarLandingPage(funcionalidades) {

    console.log("\n========================================");
    console.log("GERANDO LANDING PAGE");
    console.log("========================================\n");


    const dados =
        JSON.stringify(
            funcionalidades,
            null,
            2
        );


    const prompt = `
Você é um especialista em criação de landing pages
modernas para produtos SaaS.

Crie uma landing page profissional usando as
funcionalidades abaixo.

DADOS DO SISTEMA:

${dados}


A landing page deve conter:

1. HERO
   - Título forte
   - Subtítulo
   - CTA
   - Screenshot principal

2. BENEFÍCIOS

3. FUNCIONALIDADES
   - Uma seção para cada funcionalidade
   - Use os screenshots reais

4. SEÇÃO DE DESTAQUE

5. CTA FINAL

  - Entre em contato para comecar a usar: o link deve redirecionar para o meu whatsapp https://w.app/hgczhe

6. FOOTER


REQUISITOS DE DESIGN:

- Visual moderno
- SaaS premium
- Responsivo
- Excelente espaçamento
- Tipografia moderna
- Cards
- Bordas arredondadas
- Sombras suaves
- Animações leves
- Layout profissional
- Mobile friendly

NÃO invente funcionalidades.

Use exatamente os caminhos das imagens fornecidas.

Você deve retornar SOMENTE o HTML completo.

Inclua o CSS dentro de uma tag <style>.

Não utilize frameworks externos.
Não utilize Bootstrap.
Não utilize Tailwind.
Não utilize React.

A página deve funcionar simplesmente abrindo o
arquivo index.html.
`;


    const response =
        await openai.responses.create({

            model: "gpt-5.6-luna",

            input: prompt

        });


    let html =
        response.output_text;


    // Remove possíveis blocos markdown
    html = html
        .replace(/```html/g, "")
        .replace(/```/g, "")
        .trim();


    // --------------------------------------------------
    // SALVAR HTML
    // --------------------------------------------------

    const htmlPath =
        path.join(
            OUTPUT_DIR,
            "index.html"
        );


    fs.writeFileSync(
        htmlPath,
        html,
        "utf8"
    );


    // --------------------------------------------------
    // SALVAR JSON
    // --------------------------------------------------

    fs.writeFileSync(

        path.join(
            OUTPUT_DIR,
            "funcionalidades.json"
        ),

        JSON.stringify(
            funcionalidades,
            null,
            2
        ),

        "utf8"

    );


    console.log("\n✓ Landing page criada!");

    console.log(
        `Arquivo: ${htmlPath}`
    );
}


// ======================================================
// 4. EXECUÇÃO
// ======================================================

async function main() {

    console.log(`
╔══════════════════════════════════════╗
║     GERADOR DE LANDING PAGE IA       ║
╚══════════════════════════════════════╝
`);


    if (!SYSTEM_URL) {

        throw new Error(
            "SYSTEM_URL não configurada."
        );

    }

    if (!SYSTEM_USER) {

        throw new Error(
            "SYSTEM_USER não configurado."
        );

    }

    if (!SYSTEM_PASSWORD) {

        throw new Error(
            "SYSTEM_PASSWORD não configurada."
        );

    }

    if (!process.env.OPENAI_API_KEY) {

        throw new Error(
            "OPENAI_API_KEY não configurada."
        );

    }


    // --------------------------------------------------
    // PLAYWRIGHT
    // --------------------------------------------------

    const browser =
        await chromium.launch({

            headless: false

        });


    const context =
        await browser.newContext({

            viewport: {
                width: 1440,
                height: 900
            },

            ignoreHTTPSErrors: true

        });


    const page =
        await context.newPage();


    try {

        // Explorar sistema
        const telas =
            await explorarSistema(page);


        console.log(
            `\nTotal de telas capturadas: ${telas.length}`
        );


        // IA analisa telas
        const funcionalidades =
            await analisarTelas(telas);


        console.log(
            `\nFuncionalidades analisadas: ${funcionalidades.length}`
        );


        // IA cria landing
        await gerarLandingPage(
            funcionalidades
        );

        await gerarConteudoInstagram(
            funcionalidades
        );


        console.log(`
╔══════════════════════════════════════╗
║             CONCLUÍDO!               ║
╚══════════════════════════════════════╝

Landing page:
./output/index.html

Screenshots:
./output/images/

Dados:
./output/funcionalidades.json
`);

    }

    finally {

        await browser.close();

    }

}


// ======================================================
// START
// ======================================================

main().catch(error => {

    console.error("\nERRO:");
    console.error(error);

    process.exit(1);

});