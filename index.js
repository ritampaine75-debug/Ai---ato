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

// When a QR code is generated
client.on('qr', async (qr) => {
    console.log('QR Code received. Saving to file...');
    // Save the QR code as an image file in the repository
    await QRCode.toFile('./last_qr.png', qr);
    console.log('QR Code saved as last_qr.png. Stopping to allow GitHub to commit file.');
    
    // We exit the process so the GitHub Action can move to the next step (Git Push)
    process.exit(0); 
});

client.on('ready', () => {
    console.log('Bot is logged in and ready!');
    // Delete the QR image if it exists since we are logged in
    if (fs.existsSync('./last_qr.png')) fs.unlinkSync('./last_qr.png');
});

client.on('message', async (msg) => {
    if (msg.fromMe || msg.isGroupMsg) return;
    try {
        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL_NAME,
            messages: [{ role: "user", content: msg.body }],
        });
        msg.reply(response.choices[0].message.content);
    } catch (e) {
        console.error("API Error:", e.message);
    }
});

client.initialize();
