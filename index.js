const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { OpenAI } = require('openai');
const fs = require('fs');

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', async (qr) => {
    console.log('Generating QR Code image...');
    // Create the image file
    await QRCode.toFile('./qr.png', qr);
    console.log('QR Code saved as qr.png. Exiting to upload...');
    process.exit(0); // Stop the bot so GitHub can save the file
});

client.on('ready', () => {
    console.log('Bot is online!');
    if (fs.existsSync('./qr.png')) fs.unlinkSync('./qr.png');
});

client.on('message', async (msg) => {
    if (msg.fromMe || msg.isGroupMsg) return;
    try {
        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL_NAME,
            messages: [{ role: "user", content: msg.body }],
        });
        msg.reply(response.choices[0].message.content);
    } catch (e) { console.log(e.message); }
});

client.initialize();
