if (!global.crypto) {
    global.crypto = require('crypto').webcrypto;
}

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

async function startBot() {
    // Session folder
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // Using the built-in Chrome desktop browser identity
        browser: Browsers.macOS('Desktop')
    });

    // PAIRING CODE LOGIC
    if (!sock.authState.creds.registered) {
        let phoneNumber = process.env.PHONE_NUMBER;
        // Clean phone number (remove +, spaces, etc)
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        console.log(`\n[!] Requesting pairing code for: ${phoneNumber}`);
        
        setTimeout(async () => {
            try {
                // Request code
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n\n========================================`);
                console.log(`✅ YOUR PAIRING CODE: ${code}`);
                console.log(`========================================\n`);
                console.log(`Type this code into WhatsApp > Linked Devices > Link with Phone Number.`);
            } catch (err) {
                console.error("❌ ERROR: WhatsApp rejected the request. Wait 10 minutes and try again.");
                console.error(err.message);
            }
        }, 5000); // 5 second delay to let connection stabilize
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('\n✅ BOT IS NOW CONNECTED!');
            console.log('You can now close this tab. The bot will reply to messages.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        console.log(`Message from ${sender}: ${text}`);

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
        } catch (e) {
            console.log("AI Error");
        }
    });
}

startBot();
