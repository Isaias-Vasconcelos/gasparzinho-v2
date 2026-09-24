require("dotenv").config();

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const JSON_FILE = path.join(__dirname, "instagram.json");
const OUTPUT_DIR = path.join(__dirname, "posts");

const instagramPosts = JSON.parse(
    fs.readFileSync(JSON_FILE, "utf8")
);

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ======================================================
// LER IMAGENS
// ======================================================

function getImagePaths(screenshot) {
    if (!screenshot) {
        return [];
    }

    return screenshot
        .split(";")
        .map(x => x.trim())
        .filter(Boolean)
        .map(image => path.join(__dirname, image));
}

// ======================================================
// CONVERTER IMAGEM PARA DATA URL
// ======================================================

function imageToDataUrl(filePath) {

    if (!fs.existsSync(filePath)) {
        console.warn(`Imagem não encontrada: ${filePath}`);
        return null;
    }

    const extension = path.extname(filePath).toLowerCase();

    let mimeType = "image/png";

    if (extension === ".jpg" || extension === ".jpeg") {
        mimeType = "image/jpeg";
    }

    if (extension === ".webp") {
        mimeType = "image/webp";
    }

    const buffer = fs.readFileSync(filePath);

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

// ======================================================
// GERAR PROMPT
// ======================================================

function createPrompt(post) {

    return `
Você é um diretor de arte especializado em marketing para SaaS,
tecnologia, inteligência artificial e gestão de comunidades.

Crie uma arte profissional para Instagram baseada nas informações abaixo.

MARCA:
ModeraHub

TÍTULO:
${post.titulo}

SUBTÍTULO:
${post.subtitulo}

TEXTO PRINCIPAL:
${post.textoImagem}

CTA:
${post.cta}

DESCRIÇÃO VISUAL:
${post.descricaoVisual}

REGRAS IMPORTANTES:

- Formato vertical 4:5.
- Resolução ideal para Instagram.
- Visual premium de empresa SaaS.
- Design moderno e profissional.
- Alto contraste.
- Excelente hierarquia visual.
- Tipografia moderna.
- Não criar aparência de template genérico.
- Usar composição visual sofisticada.
- Priorizar o produto e a interface real.
- Se uma imagem de referência for fornecida, preservar a interface
  original dessa imagem.
- NÃO inventar funcionalidades que não aparecem na referência.
- NÃO modificar textos ou elementos da interface do screenshot.
- A interface do screenshot deve continuar legível.
- Utilizar os screenshots como elemento real do produto.
- Não distorcer a interface.
- Não adicionar marcas de outras empresas.
- Não adicionar logos de OpenAI, Google, Anthropic ou outras empresas.
- A identidade visual deve transmitir tecnologia, segurança,
  organização e inteligência artificial.
- O nome MODERAHUB deve aparecer de forma elegante.
- A arte deve parecer uma peça publicitária profissional produzida
  por um designer especializado em SaaS.

IMPORTANTE SOBRE TEXTO:

Utilize exatamente estes textos quando forem exibidos na arte:

Título:
"${post.titulo}"

Subtítulo:
"${post.subtitulo}"

Texto:
"${post.textoImagem}"

CTA:
"${post.cta}"

Não invente frases adicionais.
`;
}

// ======================================================
// GERAR UM POST
// ======================================================

async function generatePost(post) {

    console.log(`\n=======================================`);
    console.log(`Gerando post ${post.post}`);
    console.log(`Título: ${post.titulo}`);
    console.log(`=======================================`);

    const imagePaths = getImagePaths(post.screenshot);

    const referenceImages = imagePaths
        .map(imageToDataUrl)
        .filter(Boolean);

    const prompt = createPrompt(post);

    console.log(
        `Referências encontradas: ${referenceImages.length}`
    );

    // ==================================================
    // CRIAR CONTEÚDO PARA A API
    // ==================================================

    const content = [
        {
            type: "input_text",
            text: prompt
        }
    ];

    // Adiciona screenshots como referência
    for (const image of referenceImages) {

        content.push({
            type: "input_image",
            image_url: image
        });
    }

    // ==================================================
    // CHAMADA OPENAI
    // ==================================================

    const response = await openai.responses.create({
        model: "gpt-5.6",
        input: [
            {
                role: "user",
                content
            }
        ],
        tools: [
            {
                type: "image_generation"
            }
        ]
    });

    // ==================================================
    // PEGAR IMAGEM GERADA
    // ==================================================

    const imageResult = response.output.find(
        item => item.type === "image_generation_call"
    );

    if (!imageResult) {
        throw new Error(
            "A OpenAI não retornou uma imagem."
        );
    }

    const imageBuffer = Buffer.from(
        imageResult.result,
        "base64"
    );

    // ==================================================
    // SALVAR
    // ==================================================

    const filename = `post-${String(post.post).padStart(2, "0")}.png`;

    const outputPath = path.join(
        OUTPUT_DIR,
        filename
    );

    fs.writeFileSync(
        outputPath,
        imageBuffer
    );

    console.log(`✓ Imagem criada: ${outputPath}`);
}

// ======================================================
// EXECUTAR TODOS
// ======================================================

async function main() {

    console.log(
        `Encontrados ${instagramPosts.length} posts.`
    );

    for (const post of instagramPosts) {

        try {

            await generatePost(post);

        } catch (error) {

            console.error(
                `Erro no post ${post.post}:`,
                error.message
            );
        }
    }

    console.log("\n=======================================");
    console.log("Processamento finalizado.");
    console.log("=======================================");
}

main();