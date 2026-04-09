// 1. Fix for the Crypto error (must be at the top)
if (!global.crypto) {
    global.crypto = require('crypto').webcrypto;
}

// 2. Imports
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

// 3. Main Bot Function
async function startBot() {
    // This folder will store your login session
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // 4. Handle Pairing Code Logic
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.PHONE_NUMBER;
        if (!phoneNumber) {
            console.error("❌ ERROR: PHONE_NUMBER is missing in workflow inputs!");
            process.exit(1);
        }
        
        // Wait for the socket to be ready to request a code
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n\n========================================`);
                console.log(`✅ YOUR PAIRING CODE: ${code}`);
                console.log(`========================================\n\n`);
            } catch (err) {
                console.error("Failed to get pairing code", err);
            }
        }, 5000);
    }

    // 5. Connection Updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected Successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 6. Handle Incoming Messages & AI Reply
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        console.log(`New message from ${sender}: ${text}`);

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

            // Send reply
            await sock.sendMessage(sender, { text: aiReply });

        } catch (error) {
            console.error("AI Error:", error.response?.data || error.message);
        }
    });
}

// Start the bot
startBot();
