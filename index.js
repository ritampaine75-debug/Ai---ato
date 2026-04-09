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
        logger: pino({ level: 'info' }), // Increased logging to see errors
        // This makes WhatsApp think you are logging in from a real Chrome browser
        browser: ["Chrome (Linux)", "Chrome", "110.0.0.0"] 
    });

    // Handle Pairing Code
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.PHONE_NUMBER;
        
        console.log(`\n[!] Requesting pairing code for: ${phoneNumber}`);
        
        // Small delay to ensure socket is ready
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n\n========================================`);
                console.log(`✅ YOUR PAIRING CODE: ${code}`);
                console.log(`========================================\n`);
                console.log(`Instructions:`);
                console.log(`1. Open WhatsApp on your phone`);
                console.log(`2. Go to Linked Devices > Link a Device`);
                console.log(`3. Tap 'Link with phone number instead'`);
                console.log(`4. Enter the code above\n`);
            } catch (err) {
                console.error("❌ Could not generate pairing code:", err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'connecting') {
            console.log('--- Connecting to WhatsApp... ---');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('--- Connection closed. Reason:', lastDisconnect.error, 'Reconnecting:', shouldReconnect);
            if (shouldReconnect) startBot();
        } 
        
        if (connection === 'open') {
            console.log('\n========================================');
            console.log('✅ SUCCESS: WhatsApp Bot is now ONLINE!');
            console.log('========================================\n');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        console.log(`Incoming: ${text}`);

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
            console.error("AI Error:", error.message);
        }
    });
}

startBot().catch(err => console.log("Global Error:", err));
