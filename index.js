if (!global.crypto) {
    global.crypto = require('crypto').webcrypto;
}

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Mac OS", "Chrome", "121.0.85"] // Better compatibility
    });

    if (!sock.authState.creds.registered) {
        let phoneNumber = process.env.PHONE_NUMBER;
        // Remove any non-digits
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        console.log(`\n[!] Requesting pairing code for: ${phoneNumber}`);
        
        setTimeout(async () => {
            try {
                // IMPORTANT: We don't format the code with a dash here
                // We just get the raw code from the library
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n\n========================================`);
                console.log(`✅ YOUR PAIRING CODE: ${code}`);
                console.log(`========================================\n`);
            } catch (err) {
                console.error("❌ Error requesting code. Try again in 1 minute.");
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        try {
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
            await sock.sendMessage(sender, { text: aiReply });
        } catch (error) {
            console.log("AI Error");
        }
    });
}

startBot();
