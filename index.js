const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');

// Initialize OpenAI client configured for OpenRouter
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://github.com/automated-bot", // Optional, for OpenRouter rankings
        "X-Title": "WhatsApp AI Bot", 
    }
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome'
    }
});

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE IN YOUR WHATSAPP APP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Bot is connected and ready!');
});

client.on('message', async (msg) => {
    // Ignore group messages (optional) and messages from yourself
    if (msg.fromMe || msg.isGroupMsg) return;

    try {
        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL_NAME, // Read model from Secrets
            messages: [{ role: "user", content: msg.body }],
        });

        const aiReply = response.choices[0].message.content;
        msg.reply(aiReply);
    } catch (error) {
        console.error("OpenRouter Error:", error.message);
    }
});

client.initialize();
