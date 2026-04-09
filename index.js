const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We use Pairing Code instead
        logger: pino({ level: 'silent' })
    });

    // Handle Pairing Code
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.PHONE_NUMBER;
        if (!phoneNumber) {
            console.error("PHONE_NUMBER input is missing!");
            process.exit(1);
        }
        
        setTimeout(async () => {
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n\n========================================`);
            console.log(`YOUR PAIRING CODE: ${code}`);
            console.log(`========================================\n\n`);
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        console.log(`Received message from ${sender}: ${text}`);

        try {
            // Call OpenRouter API
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: process.env.AI_MODEL_NAME,
                messages: [{ role: 'user', content: text }]
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const aiReply = response.data.choices[0].message.content;

            // Send reply back to WhatsApp
            await sock.sendMessage(sender, { text: aiReply });

        } catch (error) {
            console.error("OpenRouter Error:", error.response?.data || error.message);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Connected Successfully!');
        }
    });
}

startBot();
