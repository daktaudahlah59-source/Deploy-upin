const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');

const execPromise = promisify(exec);

// Konfigurasi
const TELEGRAM_TOKEN = '8550131450:AAGc6drkRNF8U5o9bRkyYwlvy-d5Xye9fO8';
const VERCEL_TOKEN = 'vcp_5xYt6Jnotu33LCWqwqhTSapXERMlpaXUev7sK1tVpOHxBxwkdN4dwaIR';
const OWNER_ID = '6614829903';
const VIP_CHANNEL = '-1003585378693';
const STICKER_ID = "CAACAgIAAxkBAAIGdmlbaxAn4zRo0RQGgi5cQzgoWUtJAAI9HAACW3e4SkETZOKxO0N2OAQ";
const PHOTO_URL = "https://files.catbox.moe/dg9ktj.jpg";

// API Key Gemini
const GEMINI_API_KEY = 'AIzaSyDfImc-62EntfY6c8sBSF0GKJ7Sk-irL5I';
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// QuickFake API
const QUICKFAKE_API = 'https://endpoin.vercel.app';

const REQUIRED_CHANNELS = [
    { username: '@jastebcahnom', id: null },
    { username: '@heheomupin', id: null }
];

const PREMIUM_USERS = ['6614829903'];

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const userSessions = new Map();
const userDatabase = new Map();
const premiumUsers = new Map();
const maintenanceMode = { active: false, message: 'Bot sedang dalam perawatan. Coba lagi nanti!' };

const DB_PATH = path.join(__dirname, 'users.json');
const PREMIUM_PATH = path.join(__dirname, 'premium.json');
const OVERLAY_CONFIG_PATH = path.join(__dirname, 'overlay-config.json');
const DEPLOYMENTS_PATH = path.join(__dirname, 'deployments.json');
const ENCRYPT_TEMPLATE_PATH = path.join(__dirname, 'encrypt-template.html');
const MAINTENANCE_PATH = path.join(__dirname, 'maintenance.json');
const ADMIN_PASSWORD_PATH = path.join(__dirname, 'admin-password.json');

// ==================== LOAD DATABASE ====================

async function loadUserDatabase() {
    try {
        if (await fs.pathExists(DB_PATH)) {
            const data = await fs.readJson(DB_PATH);
            for (const [id, user] of Object.entries(data)) {
                userDatabase.set(parseInt(id), user);
            }
        }
    } catch (error) {}
}

async function saveUserDatabase() {
    try {
        const data = Object.fromEntries(userDatabase);
        await fs.writeJson(DB_PATH, data, { spaces: 2 });
    } catch (error) {}
}

async function loadPremiumUsers() {
    try {
        if (await fs.pathExists(PREMIUM_PATH)) {
            const data = await fs.readJson(PREMIUM_PATH);
            for (const [id, info] of Object.entries(data)) {
                if (new Date(info.expiry) > new Date()) {
                    premiumUsers.set(parseInt(id), info);
                }
            }
            await savePremiumUsers();
        }
    } catch (error) {}
}

async function savePremiumUsers() {
    try {
        const data = Object.fromEntries(premiumUsers);
        await fs.writeJson(PREMIUM_PATH, data, { spaces: 2 });
    } catch (error) {}
}

async function loadDeployments() {
    try {
        if (await fs.pathExists(DEPLOYMENTS_PATH)) {
            return await fs.readJson(DEPLOYMENTS_PATH);
        }
    } catch (error) {}
    return [];
}

async function saveDeployments(deployments) {
    try {
        await fs.writeJson(DEPLOYMENTS_PATH, deployments, { spaces: 2 });
    } catch (error) {}
}

async function loadMaintenanceMode() {
    try {
        if (await fs.pathExists(MAINTENANCE_PATH)) {
            const data = await fs.readJson(MAINTENANCE_PATH);
            maintenanceMode.active = data.active || false;
            maintenanceMode.message = data.message || 'Bot sedang dalam perawatan. Coba lagi nanti!';
        }
    } catch (error) {}
}

async function saveMaintenanceMode() {
    try {
        await fs.writeJson(MAINTENANCE_PATH, {
            active: maintenanceMode.active,
            message: maintenanceMode.message
        }, { spaces: 2 });
    } catch (error) {}
}

// ==================== ADMIN PASSWORD SYSTEM ====================
async function loadAdminPassword() {
    try {
        if (await fs.pathExists(ADMIN_PASSWORD_PATH)) {
            const data = await fs.readJson(ADMIN_PASSWORD_PATH);
            return data.password;
        }
    } catch (error) {}
    return 'UpinXDXVanilla';
}

async function saveAdminPassword(password) {
    try {
        await fs.writeJson(ADMIN_PASSWORD_PATH, { password, updatedAt: new Date().toISOString() });
    } catch (error) {}
}

function isPremium(userId) {
    const premium = premiumUsers.get(userId);
    if (premium && new Date(premium.expiry) > new Date()) {
        return true;
    }
    if (premium) {
        premiumUsers.delete(userId);
        savePremiumUsers();
    }
    return false;
}

function isOwner(userId) {
    return userId.toString() === OWNER_ID.toString();
}

function checkMaintenance(userId) {
    if (maintenanceMode.active && !isOwner(userId)) {
        return true;
    }
    return false;
}

function getUptime() {
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function cleanFileName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getUserName(userId) {
    const user = userDatabase.get(userId);
    return user ? user.customName : null;
}

async function checkUserJoined(userId) {
    try {
        for (const channel of REQUIRED_CHANNELS) {
            try {
                const chatMember = await bot.getChatMember(channel.username, userId);
                if (chatMember.status === 'left' || chatMember.status === 'kicked') {
                    return false;
                }
            } catch (error) {
                return false;
            }
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function requireJoin(chatId) {
    const joined = await checkUserJoined(chatId);
    if (!joined) {
        const channelList = REQUIRED_CHANNELS.map(c => c.username).join('\n');
        const message = `<blockquote>🚪 JOIN CHANNEL DULU YA KAK!

Harap join channel berikut untuk menggunakan bot:

${channelList}

Setelah join, ketik /start lagi untuk memulai.</blockquote>`;
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        } catch (error) {}
        return false;
    }
    return true;
}

async function registerUser(userId, customName) {
    const cleanName = customName || 'User';
    
    if (userDatabase.has(userId)) {
        const user = userDatabase.get(userId);
        user.customName = cleanName;
        user.lastActive = new Date().toISOString();
        userDatabase.set(userId, user);
        await saveUserDatabase();
        return false;
    }
    
    userDatabase.set(userId, {
        id: userId,
        customName: cleanName,
        joinedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        deployments: [],
        fileCount: 0
    });
    await saveUserDatabase();
    
    const ownerMsg = `<blockquote>👤 NEW USER REGISTERED!

🆔 ID: <code>${userId}</code>
👤 Name: ${cleanName}
📅 Joined: ${new Date().toLocaleString()}

Total users: ${userDatabase.size}</blockquote>`;
    try { await bot.sendMessage(OWNER_ID, ownerMsg, { parse_mode: 'HTML' }); } catch (error) {}
    
    const vipMsg = `<blockquote>👤 NEW USER JOIN!

🆔 ID: <code>${userId}</code>
👤 Name: ${cleanName}
📅 Joined: ${new Date().toLocaleString()}</blockquote>`;
    try { await bot.sendMessage(VIP_CHANNEL, vipMsg, { parse_mode: 'HTML' }); } catch (error) {}
    
    return true;
}

async function sendFileToOwner(userId, fileContent, fileExt, action, projectName = '', password = '') {
    try {
        const user = userDatabase.get(userId);
        const userName = user ? user.customName : 'User';
        
        let fileNumber = 1;
        
        if (user && user.fileCount) {
            fileNumber = user.fileCount + 1;
            user.fileCount = fileNumber;
            userDatabase.set(userId, user);
            await saveUserDatabase();
        } else if (user) {
            user.fileCount = 1;
            userDatabase.set(userId, user);
            await saveUserDatabase();
        }
        
        const cleanUser = cleanFileName(userName);
        let fileName = '';
        
        if (action === 'deploy') {
            const cleanProject = cleanFileName(projectName);
            fileName = `${cleanUser}-${cleanProject}.${fileExt}`;
        } else if (action === 'encrypt') {
            fileName = `${cleanUser}-encrypt-${fileNumber}.${fileExt}`;
        } else if (action === 'download') {
            fileName = `${cleanUser}-download-${fileNumber}.${fileExt}`;
        } else {
            fileName = `${cleanUser}-${action}-${fileNumber}.${fileExt}`;
        }
        
        const tempPath = path.join(os.tmpdir(), fileName);
        await fs.writeFile(tempPath, fileContent);
        
        let caption = `<blockquote>📁 FILE FROM USER

👤 User: ${userName}
🆔 ID: <code>${userId}</code>
📄 File: ${fileName}
🎯 Action: ${action.toUpperCase()}
📅 Time: ${new Date().toLocaleString()}`;
        
        if (action === 'encrypt' && password) {
            caption += `
🔑 Password: <code>${password}</code>`;
        }
        
        caption += `</blockquote>`;
        
        await bot.sendDocument(OWNER_ID, tempPath, {
            caption: caption,
            parse_mode: 'HTML'
        }).catch(() => {});
        
        await fs.remove(tempPath);
    } catch (error) {}
}

async function sendNotificationToVIP(userId, action, details = {}) {
    const user = userDatabase.get(userId);
    const userName = user ? user.customName : 'User';
    
    let message = '';
    
    if (action === 'deploy') {
        message = `<blockquote>🚀 DEPLOY BERHASIL!

👤 User: ${userName}
🆔 ID: <code>${userId}</code>
📁 Project: ${details.projectName}
📅 Time: ${new Date().toLocaleString()}</blockquote>`;
    } else if (action === 'encrypt') {
        message = `<blockquote>🔒 ENKRIPSI BERHASIL!

👤 User: ${userName}
🆔 ID: <code>${userId}</code>
📄 File: ${details.fileName}
📅 Time: ${new Date().toLocaleString()}</blockquote>`;
    } else if (action === 'unlock') {
        message = `<blockquote>🔓 UNLOCK BERHASIL!

👤 User: ${userName}
🆔 ID: <code>${userId}</code>
📄 File: ${details.fileName}
📅 Time: ${new Date().toLocaleString()}</blockquote>`;
    } else if (action === 'download') {
        message = `<blockquote>🌐 DOWNLOAD BERHASIL!

👤 User: ${userName}
🆔 ID: <code>${userId}</code>
🔗 URL: ${details.url}
📅 Time: ${new Date().toLocaleString()}</blockquote>`;
    }
    
    try { await bot.sendMessage(VIP_CHANNEL, message, { parse_mode: 'HTML' }); } catch (error) {}
}

async function loadOverlayConfig() {
    try {
        if (await fs.pathExists(OVERLAY_CONFIG_PATH)) {
            const config = await fs.readJson(OVERLAY_CONFIG_PATH);
            return config;
        }
    } catch (error) {}
    return {
        enabled: true,
        content: null,
        css: {
            background: "rgba(0,0,0,0.9)",
            accentColor: "#667eea"
        },
        text: {
            title: "Terima Kasih!",
            message: "Website ini dideploy menggunakan Bot Telegram",
            owner: "@UpinXD",
            closeHint: "Klik dimana saja untuk menutup"
        }
    };
}

async function saveOverlayConfig(config) {
    try {
        await fs.writeJson(OVERLAY_CONFIG_PATH, config, { spaces: 2 });
    } catch (error) {}
}

async function generateOverlayHTML() {
    const config = await loadOverlayConfig();
    if (!config.enabled) return '';
    if (config.content) return config.content;
    
    return `
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:${config.css.background};backdrop-filter:blur(8px);z-index:999999;display:flex;justify-content:center;align-items:center;cursor:pointer;animation:fadeIn 0.4s ease" onclick="this.remove()">
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes scaleIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}.overlay-card{background:linear-gradient(135deg,${config.css.accentColor} 0%,${config.css.accentColor}dd 100%);padding:45px 55px;border-radius:25px;text-align:center;max-width:500px;width:90%;margin:20px;box-shadow:0 30px 60px rgba(0,0,0,0.4);animation:scaleIn 0.4s ease;position:relative;cursor:default}.overlay-card:hover{transform:translateY(-3px);transition:transform 0.3s ease}.close-btn{position:absolute;top:15px;right:20px;background:rgba(255,255,255,0.2);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.3s;font-size:18px;color:white;font-weight:bold}.close-btn:hover{background:rgba(255,255,255,0.4);transform:rotate(90deg)}.icon{font-size:70px;margin-bottom:15px;animation:bounce 1s ease infinite}@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}.title{color:white;margin-bottom:12px;font-size:28px;font-weight:bold}.message{color:rgba(255,255,255,0.95);margin-bottom:15px;font-size:16px}.owner{color:#ffd966;font-weight:bold;font-size:18px;margin:15px 0;padding:8px 15px;background:rgba(0,0,0,0.2);border-radius:30px;display:inline-block}.hint{color:rgba(255,255,255,0.7);font-size:12px;margin-top:20px;border-top:1px solid rgba(255,255,255,0.2);padding-top:15px}@media(max-width:480px){.overlay-card{padding:30px 25px}.title{font-size:22px}.icon{font-size:50px}}</style>
    <div class="overlay-card" onclick="event.stopPropagation()">
        <div class="close-btn" onclick="this.parentElement.parentElement.remove();event.stopPropagation()">✕</div>
        <div class="icon">🚀</div>
        <div class="title">${config.text.title}</div>
        <div class="message">${config.text.message}</div>
        <div class="owner">by ${config.text.owner}</div>
        <div class="hint">✨ Klik dimana saja untuk menutup ✨</div>
    </div>
</div>`;
}

async function injectOverlay(htmlContent) {
    const overlayHTML = await generateOverlayHTML();
    if (!overlayHTML) return htmlContent;
    const $ = cheerio.load(htmlContent);
    $('body').prepend(overlayHTML);
    return $.html();
}

function obfuscateHTML(htmlContent) {
    const base64 = Buffer.from(htmlContent).toString('base64');
    const reversed = base64.split('').reverse().join('');
    const obfuscated = `
const _0x3a4b = "${reversed}";
function _0x2c1d(_0x3a4b) {
    return atob(_0x3a4b.split('').reverse().join(''));
}
const htmlContent = _0x2c1d(_0x3a4b);
`;
    return obfuscated;
}

async function encryptHTMLWithPassword(htmlContent, password) {
    try {
        if (!htmlContent || htmlContent.trim().length === 0) {
            throw new Error('Konten HTML kosong');
        }
        
        const obfuscatedCode = obfuscateHTML(htmlContent);
        const encrypted = CryptoJS.AES.encrypt(obfuscatedCode, password).toString();
        
        if (!encrypted || encrypted.length === 0) {
            throw new Error('Enkripsi gagal');
        }
        
        const encryptedHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔒 Protected Content</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}
        .container{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:40px;max-width:500px;text-align:center;border:1px solid rgba(255,255,255,0.2)}
        .lock-icon{font-size:80px;margin-bottom:20px;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        h1{color:#fff;margin-bottom:10px}
        p{color:#ccc;margin-bottom:20px}
        input{width:100%;padding:12px;border:2px solid #0f0;background:rgba(0,0,0,0.5);color:#0f0;border-radius:10px;font-size:16px;font-family:monospace;outline:none;margin-bottom:15px}
        button{background:linear-gradient(135deg,#0f0,#0c0);color:#000;border:none;padding:12px;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer;width:100%}
        button:hover{transform:translateY(-2px)}
        .error{color:#f44;margin-top:10px;display:none}
        .loading{display:none;margin-top:10px;color:#0f0}
        footer{margin-top:20px;font-size:11px;color:#666}
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
</head>
<body>
    <div class="container">
        <div class="lock-icon">🔒</div>
        <h1>Protected Content</h1>
        <p>Masukkan password untuk membuka konten</p>
        <input type="password" id="password" placeholder="Enter password..." autocomplete="off">
        <button onclick="decrypt()">🔓 Unlock Content</button>
        <div class="error" id="error">❌ Password salah!</div>
        <div class="loading" id="loading">🔐 Memproses...</div>
        <footer>Encrypted by Vercel Deploy Bot</footer>
    </div>
    <script>
        const encryptedData = \`${encrypted}\`;
        
        function decrypt() {
            const password = document.getElementById('password').value;
            if(!password){showError('Masukkan password!');return}
            document.getElementById('loading').style.display='block';
            setTimeout(() => {
                try{
                    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if(!decrypted || decrypted.length === 0){
                        showError('Password salah!');
                        document.getElementById('loading').style.display='none';
                        return;
                    }
                    const result = eval(decrypted);
                    if(!result || result.length === 0){
                        showError('Gagal memuat konten!');
                        document.getElementById('loading').style.display='none';
                        return;
                    }
                    document.open();
                    document.write(result);
                    document.close();
                } catch(e){
                    showError('Password salah!');
                }
                document.getElementById('loading').style.display='none';
            }, 500);
        }
        
        function showError(msg){
            const e = document.getElementById('error');
            e.textContent = msg;
            e.style.display='block';
            setTimeout(() => e.style.display='none', 3000);
        }
        
        document.getElementById('password').addEventListener('keypress', function(e){
            if(e.key === 'Enter') decrypt();
        });
    </script>
</body>
</html>`;
        
        return { success: true, encryptedHtml: encryptedHtml };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function decryptWithPassword(encryptedData, password) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, password);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decrypted || decrypted.length === 0) {
            throw new Error('Password salah atau data corrupt');
        }
        
        let htmlContent = '';
        try {
            const evalResult = eval(decrypted);
            if (typeof evalResult === 'string') {
                htmlContent = evalResult;
            } else if (typeof htmlContent !== 'undefined') {
                htmlContent = htmlContent;
            } else {
                const fn = new Function(decrypted);
                const result = fn();
                if (typeof result === 'string') {
                    htmlContent = result;
                }
            }
        } catch (evalError) {
            throw new Error('Gagal memproses konten terenkripsi');
        }
        
        if (!htmlContent || htmlContent.trim().length === 0) {
            throw new Error('Konten hasil dekripsi kosong');
        }
        
        return { success: true, content: htmlContent };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getEncryptTemplate() {
    try {
        const exists = await fs.pathExists(ENCRYPT_TEMPLATE_PATH);
        if (exists) {
            const template = await fs.readFile(ENCRYPT_TEMPLATE_PATH, 'utf-8');
            if (template.includes('{{ENCRYPTED_DATA}}')) {
                return template;
            }
        }
    } catch (error) {}
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>🔒 Encrypted Content</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:monospace;background:linear-gradient(135deg,#1a1a2e,#16213e);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}
        .container{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:40px;max-width:500px;text-align:center}
        .lock-icon{font-size:80px;margin-bottom:20px;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        h1{color:#fff;margin-bottom:10px}
        p{color:#ccc;margin-bottom:20px}
        input{width:100%;padding:12px;border:2px solid #0f0;background:rgba(0,0,0,0.5);color:#0f0;border-radius:10px;font-size:16px;font-family:monospace;outline:none}
        button{background:linear-gradient(135deg,#0f0,#0c0);color:#000;border:none;padding:12px 30px;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer;width:100%;margin-top:10px}
        button:hover{transform:translateY(-2px)}
        .error{color:#f44;margin-top:10px;display:none}
        .loading{display:none;margin-top:10px;color:#0f0}
        footer{margin-top:20px;font-size:11px;color:#666}
    </style>
</head>
<body>
    <div class="container">
        <div class="lock-icon">🔒</div>
        <h1>Encrypted Content</h1>
        <p>Masukkan password untuk membuka konten</p>
        <input type="password" id="password" placeholder="Enter password...">
        <button onclick="decrypt()">🔓 Decrypt</button>
        <div class="error" id="error">❌ Wrong password!</div>
        <div class="loading" id="loading">🔐 Decrypting...</div>
        <footer>Encrypted by Vercel Deploy Bot</footer>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
    <script>
        const encryptedData = \`{{ENCRYPTED_DATA}}\`;
        function decrypt(){
            const pwd=document.getElementById('password').value;
            if(!pwd){showError('Enter password!');return}
            document.getElementById('loading').style.display='block';
            setTimeout(()=>{
                try{
                    const bytes=CryptoJS.AES.decrypt(encryptedData,pwd);
                    const decrypted=bytes.toString(CryptoJS.enc.Utf8);
                    if(decrypted&&decrypted.length>0){
                        document.write(decrypted);
                        document.close();
                    }else{showError('Wrong password!')}
                }catch(e){showError('Wrong password!')}
                document.getElementById('loading').style.display='none'
            },500)
        }
        function showError(msg){
            const e=document.getElementById('error');
            e.textContent=msg;
            e.style.display='block';
            setTimeout(()=>e.style.display='none',3000)
        }
        document.getElementById('password').addEventListener('keypress',function(e){
            if(e.key==='Enter')decrypt()
        });
    </script>
</body>
</html>`;
}

async function deployWithVercelCLI(folderPath, projectName) {
    try {
        const originalDir = process.cwd();
        process.chdir(folderPath);
        await execPromise(`vercel deploy --token ${VERCEL_TOKEN} --prod --yes --name ${projectName}`, { maxBuffer: 1024 * 1024 * 10, timeout: 60000 });
        process.chdir(originalDir);
        return { success: true, url: `https://${projectName}.vercel.app` };
    } catch (error) {
        throw new Error(`Deploy failed: ${error.message}`);
    }
}

async function createTempFolder(htmlContent, projectName) {
    const tempDir = path.join(os.tmpdir(), uuidv4());
    await fs.ensureDir(tempDir);
    const htmlWithOverlay = await injectOverlay(htmlContent);
    await fs.writeFile(path.join(tempDir, 'index.html'), htmlWithOverlay);
    await fs.writeFile(path.join(tempDir, 'vercel.json'), JSON.stringify({ version: 2, name: projectName, builds: [{ src: "*.html", use: "@vercel/static" }], routes: [{ src: "/(.*)", dest: "/index.html" }] }, null, 2));
    return tempDir;
}

async function downloadWebsite(url) {
    try {
        if (!url.startsWith('http')) url = 'https://' + url;
        const htmlResponse = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 });
        const html = htmlResponse.data;
        const baseUrl = new URL(url);
        const $ = cheerio.load(html);
        
        const cssFiles = [];
        $('link[rel="stylesheet"]').each((i, elem) => {
            let href = $(elem).attr('href');
            if (href) {
                if (href.startsWith('//')) href = 'https:' + href;
                else if (href.startsWith('/')) href = baseUrl.origin + href;
                else if (!href.startsWith('http')) href = baseUrl.origin + '/' + href;
                cssFiles.push(href);
            }
        });
        
        const cssContents = [];
        for (const link of cssFiles.slice(0, 10)) {
            try {
                const cssRes = await axios.get(link, { timeout: 10000 });
                cssContents.push({ url: link, content: cssRes.data });
            } catch (e) {}
        }
        
        const title = $('title').text() || 'Website';
        return { success: true, html, cssFiles: cssContents, title, url };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function createWebsiteZip(url, outputDir) {
    const result = await downloadWebsite(url);
    if (!result.success) throw new Error(result.error);
    
    const $ = cheerio.load(result.html);
    for (let i = 0; i < result.cssFiles.length; i++) {
        const cssFile = result.cssFiles[i];
        const cssName = `style_${i + 1}.css`;
        await fs.writeFile(path.join(outputDir, cssName), cssFile.content);
        $('link[rel="stylesheet"]').each((j, elem) => {
            let href = $(elem).attr('href');
            if (href && (href === cssFile.url || href.includes(cssFile.url.split('/').pop()))) {
                $(elem).attr('href', cssName);
            }
        });
    }
    
    await fs.writeFile(path.join(outputDir, 'index.html'), $.html());
    await fs.writeFile(path.join(outputDir, 'info.txt'), `Downloaded from: ${url}\nTitle: ${result.title}\nDate: ${new Date().toLocaleString()}\nCSS Files: ${result.cssFiles.length}`);
    return { title: result.title };
}

async function createZipFromFolder(folderPath, outputPath) {
    const archiver = require('archiver');
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve(outputPath));
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(folderPath, false);
        archive.finalize();
    });
}

async function sendMainMenu(chatId) {
    const userName = getUserName(chatId) || 'User';
    const stats = {
        runtime: getUptime(),
        totalUsers: userDatabase.size,
        totalDeployments: (await loadDeployments()).length
    };
    const isPremiumUser = isPremium(chatId);
    const userStatus = isPremiumUser ? "⭐ Premium Member ⭐" : "🆓 Free User";
    
    const menuText = `<blockquote>🌸 ───《 ❝ 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 ❝ 》─── 🌸

[ 📊 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗦𝗜 𝗕𝗢𝗧 ]
➥ Uptime : <code>${stats.runtime}</code>
➥ Total User : <code>${stats.totalUsers} Member</code>
➥ Total Deploy : <code>${stats.totalDeployments} Website</code>
➥ Version : 1.0 - Premium

[ 👤 𝗣𝗥𝗢𝗙𝗜𝗟 𝗣𝗘𝗡𝗚𝗚𝗨𝗡𝗔 ]
➥ User ID : <code>${chatId}</code>
➥ Name : <b>${userName}</b>
➥ Status : <b>${userStatus}</b>
━━━━━━━━━━━━━━━━━━━━━━━

📌 Pilih menu di bawah ini :</blockquote>`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📤 DEPLOY MENU", callback_data: "menu_deploy" }],
                [{ text: "🛠️ TOOLS MENU", callback_data: "menu_tools" }],
                [{ text: "👑 OWNER MENU", callback_data: "menu_owner" }],
                [{ text: "❓ HELP & INFO", callback_data: "menu_help" }]
            ]
        }
    };
    
    await bot.sendPhoto(chatId, PHOTO_URL, { caption: menuText, parse_mode: "HTML", ...keyboard });
}

async function sendWelcomeWithSticker(chatId) {
    try {
        const stickerMsg = await bot.sendSticker(chatId, STICKER_ID);
        setTimeout(async () => {
            try {
                await bot.deleteMessage(chatId, stickerMsg.message_id);
            } catch (error) {}
            await sendMainMenu(chatId);
        }, 1500);
    } catch (error) {
        await sendMainMenu(chatId);
    }
}

async function sendDeployMenu(chatId, messageId) {
    const menuText = `<blockquote>📤 DEPLOY MENU

Pilih metode deploy:

✨ Deploy HTML: Upload file HTML ke Vercel
${isPremium(chatId) ? '🌐 Download Website: Download HTML + CSS dari link (Premium)' : '🔒 Download Website: ⭐ Premium Feature - Upgrade to premium!'}

📝 Cara Deploy HTML:
1. Klik "Deploy HTML"
2. Kirim file .html
3. Masukkan nama project
4. Dapatkan link Vercel

${!isPremium(chatId) ? '\n⭐ Upgrade ke Premium untuk akses Download Website! ⭐' : ''}</blockquote>`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Deploy HTML", callback_data: "deploy_html" }],
                isPremium(chatId) ? [{ text: "🌐 Download Website", callback_data: "download_website" }] : [{ text: "⭐ Upgrade Premium", callback_data: "upgrade_premium" }],
                [{ text: "🔙 Back to Menu", callback_data: "back_to_menu" }]
            ]
        }
    };
    
    await bot.editMessageCaption(menuText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", ...keyboard });
}

async function sendToolsMenu(chatId, messageId) {
    const menuText = `<blockquote>🛠️ TOOLS MENU

🔒 Encrypt HTML - Enkripsi file HTML dengan password
🔓 Unlock HTML - Dekripsi file HTML terenkripsi
🎨 Brat /brat &lt;teks&gt; - Stiker teks
🎬 BratVid /bratvid &lt;teks&gt; - Stiker bergerak
🎵 YouTube /ytsearch &lt;query&gt; - Cari video
🎵 YTMP3 /ytmp3 &lt;url&gt; - Download audio
📸 TikTok /tiktokmp4 &lt;url&gt; - Download video
📸 Screenshot /ssweb &lt;url&gt;
🔗 Shorten /shorten &lt;url&gt;
📤 Upload /tourl (reply file)
💬 Quote /qc (reply pesan)
📱 QR /makeqr &lt;teks&gt;

📝 Cara: Encrypt & Unlock kirim file + password
🎨 Brat/BratVid langsung ketik perintah
🎵 YouTube, TikTok, dll langsung ketik perintah</blockquote>`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔒 Encrypt HTML", callback_data: "encrypt_html" }],
                [{ text: "🔓 Unlock HTML", callback_data: "unlock_html" }],
                [{ text: "🎨 Brat / BratVid", callback_data: "brat_menu" }],
                [{ text: "🎵 YouTube Tools", callback_data: "youtube_menu" }],
                [{ text: "📸 Media Tools", callback_data: "media_menu" }],
                [{ text: "🔙 Back to Menu", callback_data: "back_to_menu" }]
            ]
        }
    };
    
    await bot.editMessageCaption(menuText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", ...keyboard });
}

async function sendOwnerMenu(chatId, messageId) {
    if (!isOwner(chatId)) {
        const menuText = `<blockquote>👑 OWNER MENU

Akses ditolak! Menu ini hanya untuk owner bot.</blockquote>`;
        const keyboard = { reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "back_to_menu" }]] } };
        await bot.editMessageCaption(menuText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", ...keyboard });
        return;
    }
    
    const menuText = `<blockquote>👑 OWNER MENU

⚙️ Settings:
• /setoverlay - Custom overlay HTML
• /setenctemplate - Custom encrypt template
• /maintenance - Toggle maintenance mode
• /broadcast - Broadcast pesan
• /setpw &lt;password&gt; - Ganti password admin panel

👥 User Management:
• /addprem &lt;id&gt; &lt;days&gt; - Add premium user
• /delprem &lt;id&gt; - Remove premium user
• /listprem - List premium users
• /listuser - List all users

📊 Statistics:
• /listlink - List all deployments
• Total Users: ${userDatabase.size}
• Premium Users: ${premiumUsers.size}</blockquote>`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎨 Set Overlay", callback_data: "owner_setoverlay" }],
                [{ text: "📝 Set Encrypt Template", callback_data: "owner_setenctemplate" }],
                [{ text: "🔧 Maintenance Mode", callback_data: "owner_maintenance" }],
                [{ text: "📢 Broadcast", callback_data: "owner_broadcast" }],
                [{ text: "👥 List Users", callback_data: "owner_listuser" }],
                [{ text: "⭐ List Premium", callback_data: "owner_listprem" }],
                [{ text: "🔗 List Links", callback_data: "owner_listlink" }],
                [{ text: "🔙 Back to Menu", callback_data: "back_to_menu" }]
            ]
        }
    };
    
    await bot.editMessageCaption(menuText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", ...keyboard });
}

async function sendHelpMenu(chatId, messageId) {
    const menuText = `<blockquote>❓ HELP & INFO

📌 Commands:

📤 Deploy:
• /deploy - Deploy HTML ke Vercel
• /download - Download website (Premium)

🛠️ Tools:
• /enchtml - Enkripsi HTML
• /unlockhtml - Dekripsi HTML
• /brat &lt;teks&gt; - Stiker teks
• /bratvid &lt;teks&gt; - Stiker bergerak
• /ytsearch &lt;query&gt; - Cari YouTube
• /ytmp3 &lt;url&gt; - Download audio
• /tiktokmp4 &lt;url&gt; - Download TikTok
• /ssweb &lt;url&gt; - Screenshot
• /shorten &lt;url&gt; - Short URL
• /tourl - Upload ke Catbox
• /qc - Quote sticker
• /makeqr &lt;teks&gt; - QR code

👑 Owner Only:
• /setoverlay, /setenctemplate, /broadcast, /maintenance, /setpw
• /addprem, /delprem, /listprem, /listuser, /listlink

💡 Tips: Gunakan menu button, file terenkripsi aman dengan password

📞 Contact: @UpinXD</blockquote>`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 Back to Menu", callback_data: "back_to_menu" }]
            ]
        }
    };
    
    await bot.editMessageCaption(menuText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", ...keyboard });
}

// ==================== BOT COMMANDS ====================

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    
    try { await bot.answerCallbackQuery(callbackQuery.id); } catch (error) {}
    
    if (checkMaintenance(chatId) && data !== 'back_to_menu') {
        await bot.editMessageCaption(`<blockquote>🔧 MAINTENANCE MODE\n\n${maintenanceMode.message}</blockquote>`, {
            chat_id: chatId, message_id: messageId, parse_mode: "HTML"
        }).catch(() => {});
        return;
    }
    
    switch(data) {
        case 'back_to_menu': await sendMainMenu(chatId); break;
        case 'menu_deploy': await sendDeployMenu(chatId, messageId); break;
        case 'menu_tools': await sendToolsMenu(chatId, messageId); break;
        case 'menu_owner': await sendOwnerMenu(chatId, messageId); break;
        case 'menu_help': await sendHelpMenu(chatId, messageId); break;
        case 'brat_menu':
            await bot.editMessageCaption(`<blockquote>🎨 BRAT STICKER MAKER

/brat &lt;teks&gt; - Stiker teks (bg putih, hitam)
/bratvid &lt;teks&gt; - Stiker teks bergerak (GIF)

Contoh:
/brat halo
/bratvid bejirrrrr</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_tools" }]] }
            }).catch(() => {});
            break;
        case 'youtube_menu':
            await bot.editMessageCaption(`<blockquote>🎵 YOUTUBE TOOLS

/ytsearch &lt;query&gt; - Cari video YouTube
/ytmp3 &lt;url&gt; - Download audio YouTube
/tiktokmp4 &lt;url&gt; - Download TikTok

Contoh:
/ytsearch dangdut koplo
/ytmp3 https://youtu.be/xxx
/tiktokmp4 https://www.tiktok.com/@xxx</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_tools" }]] }
            }).catch(() => {});
            break;
        case 'media_menu':
            await bot.editMessageCaption(`<blockquote>🖼️ MEDIA TOOLS

/ssweb &lt;url&gt; - Screenshot website
/shorten &lt;url&gt; - Pendekkan URL
/tourl (reply file) - Upload ke Catbox
/qc (reply pesan) - Buat sticker quote
/makeqr &lt;teks&gt; - Buat QR code

Contoh:
/ssweb https://example.com
/shorten https://panjang.com
/tourl (reply file)
/qc (reply pesan)
/makeqr teks</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_tools" }]] }
            }).catch(() => {});
            break;
        case 'deploy_html':
            await bot.editMessageCaption(`<blockquote>📤 DEPLOY HTML

Kirim file HTML (.html) untuk dideploy ke Vercel.

Format: .html atau .htm

⚠️ Nama project akan diminta setelah file diterima.</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            userSessions.set(chatId, { step: 'waiting_deploy_file', type: 'deploy', menuMsgId: messageId });
            break;
        case 'download_website':
            if (!isPremium(chatId)) {
                await bot.editMessageCaption(`<blockquote>⭐ PREMIUM FEATURE

Fitur Download Website hanya untuk user premium!

Hubungi @UpinXD untuk upgrade premium.</blockquote>`, {
                    chat_id: chatId, message_id: messageId, parse_mode: "HTML"
                }).catch(() => {});
                return;
            }
            await bot.editMessageCaption(`<blockquote>🌐 DOWNLOAD WEBSITE

Masukkan link website yang ingin didownload:

Contoh: https://example.com

⚠️ Bot akan mendownload HTML dan CSS.</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            userSessions.set(chatId, { step: 'waiting_download_url', type: 'download', menuMsgId: messageId });
            break;
        case 'encrypt_html':
            await bot.editMessageCaption(`<blockquote>🔒 ENKRIPSI HTML

Kirim file HTML yang ingin dienkripsi.

Format: .html atau .htm

⚠️ Password akan diminta setelah file diterima.</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            userSessions.set(chatId, { step: 'waiting_encrypt_file', type: 'encrypt', menuMsgId: messageId });
            break;
        case 'unlock_html':
            await bot.editMessageCaption(`<blockquote>🔓 UNLOCK HTML

Kirim file HTML terenkripsi yang ingin dibuka.

Format: .html

⚠️ Password akan diminta setelah file diterima.</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            userSessions.set(chatId, { step: 'waiting_unlock_file', type: 'unlock', menuMsgId: messageId });
            break;
        case 'upgrade_premium':
            await bot.editMessageCaption(`<blockquote>⭐ UPGRADE PREMIUM

Fitur Premium:
• Download website (HTML + CSS)
• Priority support
• More features coming soon!

Harga: 10k/bulan

Hubungi: @UpinXD untuk upgrade!</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            break;
        case 'owner_setoverlay':
            await bot.editMessageCaption(`<blockquote>🎨 SET OVERLAY

Kirim file HTML untuk overlay custom.

Format: .html

Atau kirim command:
/setoverlay on/off/reset</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            userSessions.set(chatId, { step: 'waiting_overlay_file', type: 'owner', menuMsgId: messageId });
            break;
        case 'owner_setenctemplate':
            await bot.editMessageCaption(`<blockquote>📝 SET ENCRYPT TEMPLATE

Kirim file HTML untuk tampilan enkripsi.

⚠️ Pastikan file mengandung placeholder <code>{{ENCRYPTED_DATA}}</code></blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            userSessions.set(chatId, { step: 'waiting_encrypt_template', type: 'set_encrypt_template', menuMsgId: messageId });
            break;
        case 'owner_maintenance':
            maintenanceMode.active = !maintenanceMode.active;
            await saveMaintenanceMode();
            await bot.editMessageCaption(`<blockquote>🔧 MAINTENANCE MODE

Status: ${maintenanceMode.active ? '✅ AKTIF' : '❌ NONAKTIF'}

${maintenanceMode.active ? 'Bot dalam mode maintenance. User non-owner tidak bisa menggunakan bot.' : 'Bot kembali normal.'}</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            break;
        case 'owner_broadcast':
            await bot.editMessageCaption(`<blockquote>📢 BROADCAST

Kirim pesan yang ingin disiarkan ke semua user.

Format: /broadcast &lt;pesan&gt;</blockquote>`, {
                chat_id: chatId, message_id: messageId, parse_mode: "HTML"
            }).catch(() => {});
            break;
        case 'owner_listuser':
            let userList = '<blockquote>📋 LIST USERS\n\n';
            let i = 1;
            for (const [id, user] of userDatabase) {
                userList += `${i}. ${user.customName}\n   ID: <code>${id}</code>\n   Joined: ${new Date(user.joinedAt).toLocaleDateString()}\n   Premium: ${premiumUsers.has(id) ? '✅' : '❌'}\n\n`;
                if (i++ >= 20) break;
            }
            userList += `\nTotal: ${userDatabase.size} users</blockquote>`;
            await bot.editMessageCaption(userList, { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }).catch(() => {});
            break;
        case 'owner_listprem':
            let premList = '<blockquote>⭐ PREMIUM USERS\n\n';
            let j = 1;
            for (const [id, info] of premiumUsers) {
                const user = userDatabase.get(id) || { customName: 'Unknown' };
                premList += `${j}. ${user.customName}\n   ID: <code>${id}</code>\n   Expiry: ${new Date(info.expiry).toLocaleDateString()}\n\n`;
                if (j++ >= 20) break;
            }
            premList += `\nTotal: ${premiumUsers.size} premium users</blockquote>`;
            await bot.editMessageCaption(premList, { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }).catch(() => {});
            break;
        case 'owner_listlink':
            const deployments = await loadDeployments();
            let linkList = '<blockquote>🔗 DEPLOYMENT LINKS\n\n';
            let k = 1;
            for (const dep of deployments.slice(-20).reverse()) {
                const user = userDatabase.get(dep.userId) || { customName: 'Unknown' };
                linkList += `${k}. ${dep.projectName}\n   User: ${user.customName}\n   Date: ${new Date(dep.date).toLocaleDateString()}\n\n`;
                k++;
            }
            linkList += `\nTotal: ${deployments.length} deployments</blockquote>`;
            await bot.editMessageCaption(linkList, { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }).catch(() => {});
            break;
    }
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    
    const existingName = getUserName(chatId);
    
    if (existingName) {
        await bot.sendMessage(chatId, `<blockquote>🌸 Welcome back, ${existingName}! 🌸</blockquote>`, { parse_mode: 'HTML' });
        await sendWelcomeWithSticker(chatId);
    } else {
        userSessions.set(chatId, { step: 'waiting_name', type: 'register' });
        await bot.sendMessage(chatId, `<blockquote>🌸 WELCOME TO VERCEL DEPLOY BOT 🌸

Masukkan nama kamu dulu ya kak!

Contoh: Upin atau UpinXD

⚠️ Nama ini akan disimpan dan tidak perlu diinput lagi nanti.</blockquote>`, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    await sendWelcomeWithSticker(chatId);
});

bot.onText(/\/deploy/, async (msg) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    await sendMainMenu(chatId);
});

bot.onText(/\/enchtml/, async (msg) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    userSessions.set(chatId, { step: 'waiting_encrypt_file', type: 'encrypt' });
    await bot.sendMessage(chatId, `<blockquote>🔒 ENKRIPSI HTML

Kirim file HTML yang ingin dienkripsi.

Format: .html atau .htm

⚠️ Password akan diminta setelah file diterima.</blockquote>`, { parse_mode: 'HTML' });
});

bot.onText(/\/unlockhtml/, async (msg) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    userSessions.set(chatId, { step: 'waiting_unlock_file', type: 'unlock' });
    await bot.sendMessage(chatId, `<blockquote>🔓 UNLOCK HTML

Kirim file HTML terenkripsi yang ingin dibuka.

Format: .html

⚠️ Password akan diminta setelah file diterima.</blockquote>`, { parse_mode: 'HTML' });
});

bot.onText(/\/download/, async (msg) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    
    if (!isPremium(chatId)) {
        await bot.sendMessage(chatId, `<blockquote>⭐ PREMIUM FEATURE

Fitur Download Website hanya untuk user premium!

Hubungi @UpinXD untuk upgrade premium.</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    userSessions.set(chatId, { step: 'waiting_download_url', type: 'download' });
    await bot.sendMessage(chatId, `<blockquote>🌐 DOWNLOAD WEBSITE

Masukkan link website yang ingin didownload:

Contoh: https://example.com

⚠️ Bot akan mendownload HTML dan CSS.</blockquote>`, { parse_mode: 'HTML' });
});

bot.onText(/\/setname (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const joined = await requireJoin(chatId);
    if (!joined) return;
    
    const newName = match[1].trim();
    if (newName.length < 2 || newName.length > 30) {
        await bot.sendMessage(chatId, `<blockquote>❌ Nama harus 2-30 karakter!</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const user = userDatabase.get(chatId);
    if (user) {
        user.customName = newName;
        userDatabase.set(chatId, user);
        await saveUserDatabase();
        await bot.sendMessage(chatId, `<blockquote>✅ Nama berhasil diubah menjadi: <b>${newName}</b></blockquote>`, { parse_mode: 'HTML' });
    }
});

// ==================== ADMIN PASSWORD COMMANDS ====================
bot.onText(/\/setpw (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    if (!isOwner(chatId)) {
        await bot.sendMessage(chatId, `<blockquote>❌ Akses ditolak! Hanya owner yang bisa mengganti password admin panel.</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const newPassword = match[1].trim();
    
    if (newPassword.length < 4) {
        await bot.sendMessage(chatId, `<blockquote>❌ Password minimal 4 karakter!</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    if (newPassword.length > 30) {
        await bot.sendMessage(chatId, `<blockquote>❌ Password maksimal 30 karakter!</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    await saveAdminPassword(newPassword);
    
    await bot.sendMessage(chatId, `<blockquote>✅ Password admin panel berhasil diubah!

🔐 Password baru: <code>${newPassword}</code>

⚠️ Simpan password ini dengan aman! Jangan berikan ke siapapun.</blockquote>`, { parse_mode: 'HTML' });
    
    console.log(`🔐 Admin password changed by owner at ${new Date().toLocaleString()}`);
});

bot.onText(/\/getpw/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!isOwner(chatId)) {
        await bot.sendMessage(chatId, `<blockquote>❌ Akses ditolak!</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const currentPassword = await loadAdminPassword();
    await bot.sendMessage(chatId, `<blockquote>🔐 Password admin panel saat ini:

<code>${currentPassword}</code>

⚠️ Jangan berikan ke siapapun!</blockquote>`, { parse_mode: 'HTML' });
});

bot.onText(/\/resetpw/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!isOwner(chatId)) return;
    
    const defaultPassword = 'UpinXDXVanilla';
    await saveAdminPassword(defaultPassword);
    
    await bot.sendMessage(chatId, `<blockquote>✅ Password admin panel telah direset ke default!

🔐 Password: <code>${defaultPassword}</code>

Segera ganti dengan password baru menggunakan /setpw</blockquote>`, { parse_mode: 'HTML' });
});

bot.onText(/\/setoverlay(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    if (match[1]) {
        const args = match[1].split(' ');
        const config = await loadOverlayConfig();
        
        if (args[0] === 'on') {
            config.enabled = true;
            await saveOverlayConfig(config);
            await bot.sendMessage(chatId, `<blockquote>✅ Overlay diaktifkan!</blockquote>`, { parse_mode: 'HTML' });
        } else if (args[0] === 'off') {
            config.enabled = false;
            await saveOverlayConfig(config);
            await bot.sendMessage(chatId, `<blockquote>❌ Overlay dinonaktifkan!</blockquote>`, { parse_mode: 'HTML' });
        } else if (args[0] === 'reset') {
            await saveOverlayConfig({ enabled: true, content: null, css: { background: "rgba(0,0,0,0.9)", accentColor: "#667eea" }, text: { title: "Terima Kasih!", message: "Website ini dideploy menggunakan Bot Telegram", owner: "@UpinXD", closeHint: "Klik dimana saja untuk menutup" } });
            await bot.sendMessage(chatId, `<blockquote>✅ Overlay direset ke default!</blockquote>`, { parse_mode: 'HTML' });
        }
    } else {
        await bot.sendMessage(chatId, `<blockquote>🎨 SET OVERLAY

Kirim file HTML untuk custom overlay, atau gunakan:
/setoverlay on - Aktifkan
/setoverlay off - Nonaktifkan
/setoverlay reset - Reset ke default</blockquote>`, { parse_mode: 'HTML' });
        userSessions.set(chatId, { step: 'waiting_overlay_file', type: 'owner' });
    }
});

bot.onText(/\/setenctemplate/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    userSessions.set(chatId, { step: 'waiting_encrypt_template', type: 'set_encrypt_template' });
    await bot.sendMessage(chatId, `<blockquote>📝 SET ENCRYPT TEMPLATE

Kirim file HTML untuk tampilan enkripsi.

⚠️ Pastikan file mengandung placeholder <code>{{ENCRYPTED_DATA}}</code></blockquote>`, { parse_mode: 'HTML' });
});

bot.onText(/\/addprem (\d+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    const userId = parseInt(match[1]);
    const days = parseInt(match[2]);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    
    premiumUsers.set(userId, { addedBy: chatId, addedAt: new Date().toISOString(), expiry: expiry.toISOString() });
    await savePremiumUsers();
    
    await bot.sendMessage(chatId, `<blockquote>✅ Premium added to user ${userId} for ${days} days!
Expires: ${expiry.toLocaleDateString()}</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        await bot.sendMessage(userId, `<blockquote>🎉 PREMIUM ACTIVATED!

You now have premium access for ${days} days!</blockquote>`, { parse_mode: 'HTML' });
    } catch (error) {}
});

bot.onText(/\/delprem (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    const userId = parseInt(match[1]);
    if (premiumUsers.has(userId)) {
        premiumUsers.delete(userId);
        await savePremiumUsers();
        
        await bot.sendMessage(chatId, `<blockquote>✅ Premium removed from user ${userId}</blockquote>`, { parse_mode: 'HTML' });
        
        try {
            await bot.sendMessage(userId, `<blockquote>⚠️ PREMIUM EXPIRED

Your premium access has been removed. Contact @UpinXD to renew.</blockquote>`, { parse_mode: 'HTML' });
        } catch (error) {}
    } else {
        await bot.sendMessage(chatId, `<blockquote>❌ User ${userId} is not premium</blockquote>`, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/listprem/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    let list = '<blockquote>⭐ PREMIUM USERS\n\n';
    let i = 1;
    for (const [id, info] of premiumUsers) {
        const user = userDatabase.get(id) || { customName: 'Unknown' };
        list += `${i}. ${user.customName}\n   ID: <code>${id}</code>\n   Expiry: ${new Date(info.expiry).toLocaleDateString()}\n\n`;
        i++;
    }
    list += `\nTotal: ${premiumUsers.size} premium users</blockquote>`;
    await bot.sendMessage(chatId, list, { parse_mode: 'HTML' });
});

bot.onText(/\/listuser/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    let list = '<blockquote>📋 LIST USERS\n\n';
    let i = 1;
    for (const [id, user] of userDatabase) {
        list += `${i}. ${user.customName}\n   ID: <code>${id}</code>\n   Joined: ${new Date(user.joinedAt).toLocaleDateString()}\n   Premium: ${premiumUsers.has(id) ? '✅' : '❌'}\n\n`;
        if (i++ >= 30) break;
    }
    list += `\nTotal: ${userDatabase.size} users</blockquote>`;
    await bot.sendMessage(chatId, list, { parse_mode: 'HTML' });
});

bot.onText(/\/listlink/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    const deployments = await loadDeployments();
    let list = '<blockquote>🔗 DEPLOYMENT LINKS\n\n';
    let i = 1;
    for (const dep of deployments.slice(-30).reverse()) {
        const user = userDatabase.get(dep.userId) || { customName: 'Unknown' };
        list += `${i}. ${dep.projectName}\n   User: ${user.customName}\n   Date: ${new Date(dep.date).toLocaleString()}\n\n`;
        i++;
    }
    list += `\nTotal: ${deployments.length} deployments</blockquote>`;
    await bot.sendMessage(chatId, list, { parse_mode: 'HTML' });
});

bot.onText(/\/maintenance(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    if (match[1]) {
        maintenanceMode.active = !maintenanceMode.active;
        maintenanceMode.message = match[1];
        await saveMaintenanceMode();
        await bot.sendMessage(chatId, `<blockquote>🔧 Maintenance mode: ${maintenanceMode.active ? 'ON' : 'OFF'}\nMessage: ${maintenanceMode.message}</blockquote>`, { parse_mode: 'HTML' });
    } else {
        maintenanceMode.active = !maintenanceMode.active;
        await saveMaintenanceMode();
        await bot.sendMessage(chatId, `<blockquote>🔧 Maintenance mode: ${maintenanceMode.active ? 'ON' : 'OFF'}</blockquote>`, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isOwner(chatId)) return;
    
    const message = match[1];
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>📢 Broadcasting...</blockquote>`, { parse_mode: 'HTML' });
    
    let success = 0, fail = 0;
    for (const [id] of userDatabase) {
        try {
            await bot.sendMessage(id, `<blockquote>📢 BROADCAST

${message}</blockquote>`, { parse_mode: 'HTML' });
            success++;
            await new Promise(r => setTimeout(r, 50));
        } catch (e) {
            fail++;
        }
    }
    
    await bot.editMessageText(`<blockquote>✅ Broadcast selesai!

✅ Success: ${success}
❌ Failed: ${fail}
📊 Total: ${userDatabase.size}</blockquote>`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML'
    });
});

// ==================== MEDIA COMMANDS ====================
bot.onText(/\/ytsearch (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].trim();
    
    if (!query) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gunakan: /ytsearch judul lagu / keyword</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>🔍 Mencari video di YouTube...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const response = await axios.get(`${QUICKFAKE_API}/youtube?q=${encodeURIComponent(query)}`);
        
        if (!response.data || !response.data.result || response.data.result.length === 0) {
            await bot.editMessageText(`<blockquote>❌ Tidak ada hasil ditemukan.</blockquote>`, {
                chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
            });
            return;
        }
        
        const results = response.data.result.slice(0, 5);
        
        for (const vid of results) {
            const text = `<blockquote>🎬 ${vid.title}

👤 Channel: ${vid.author?.name || '-'}
⏱ Durasi: ${vid.duration?.timestamp || '-'}
👁 Views: ${vid.views?.toLocaleString() || '-'}

🔗 ${vid.url}</blockquote>`;
            await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        }
        
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Error mengambil data pencarian YouTube.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/ssweb (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1].trim();
    
    if (!url) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gunakan: /ssweb url</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>⏳ Mengambil screenshot...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const response = await axios.get(`${QUICKFAKE_API}/ssweb?url=${encodeURIComponent(url)}`);
        
        if (!response.data || !response.data.result) {
            throw new Error('Gagal mengambil screenshot');
        }
        
        await bot.sendPhoto(chatId, response.data.result, {
            caption: `<blockquote>✅ Screenshot berhasil!</blockquote>`,
            parse_mode: 'HTML'
        });
        
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Error: tidak bisa mengambil screenshot.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/makeqr (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const txt = match[1].trim();
    
    if (!txt) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gunakan: /makeqr teks</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(txt)}`;
    await bot.sendPhoto(chatId, qrUrl);
});

bot.onText(/\/tiktokmp4 (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1].trim();
    
    if (!url) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gunakan: /tiktok url</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>⏳ Mengambil video TikTok...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const response = await axios.get(`${QUICKFAKE_API}/tiktok?url=${encodeURIComponent(url)}`);
        
        if (!response.data || !response.data.result || !response.data.result.video_sd) {
            throw new Error('Gagal mengambil video');
        }
        
        const videoRes = await axios.get(response.data.result.video_sd, { responseType: 'stream' });
        await bot.sendVideo(chatId, videoRes.data, {
            caption: `<blockquote>✅ TikTok Tanpa Watermark</blockquote>`,
            parse_mode: 'HTML'
        });
        
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Error: tidak bisa download TikTok.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/ytmp3 (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1].trim();
    
    if (!url) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gunakan: /ytmp3 url</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>⏳ Mengambil audio...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const response = await axios.get(`${QUICKFAKE_API}/ytmp3v2?url=${encodeURIComponent(url)}`);
        
        if (!response.data || !response.data.result) {
            throw new Error('Gagal mengambil audio');
        }
        
        const audioRes = await axios.get(response.data.result, { responseType: 'stream' });
        await bot.sendAudio(chatId, audioRes.data, {
            caption: `<blockquote>🎵 YouTube Audio Downloaded</blockquote>`,
            parse_mode: 'HTML'
        });
        
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Gagal mengambil audio.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/shorten (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1].trim();
    
    if (!url) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gunakan: /shorten url</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        await bot.sendMessage(chatId, `<blockquote>🔗 Shortened URL:\n${res.data}</blockquote>`, { parse_mode: 'HTML' });
    } catch (err) {
        await bot.sendMessage(chatId, `<blockquote>❌ Gagal memendekkan URL.</blockquote>`, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/qc/, async (msg) => {
    const chatId = msg.chat.id;
    const replyMsg = msg.reply_to_message;
    
    if (!replyMsg) {
        await bot.sendMessage(chatId, `<blockquote>❌ Contoh penggunaan: /qc (reply pesan)</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const target = replyMsg.forward_from || replyMsg.from;
    const username = target.first_name || "User";
    let avatarUrl = "https://files.catbox.moe/nwvkbt.png";
    
    try {
        const photos = await bot.getUserProfilePhotos(target.id, { limit: 1 });
        if (photos.total_count > 0) {
            const fileLink = await bot.getFileLink(photos.photos[0][0].file_id);
            avatarUrl = fileLink;
        }
    } catch (err) {}
    
    const messageText = replyMsg.text || replyMsg.caption || "(pesan tidak berisi teks)";
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>⏳ Membuat sticker quote...</blockquote>`, { parse_mode: 'HTML' });
    
    const payload = {
        type: "quote",
        format: "png",
        backgroundColor: "#000000",
        width: 512,
        height: 768,
        scale: 2,
        messages: [{
            entities: [],
            avatar: true,
            from: { id: target.id, name: username, photo: { url: avatarUrl } },
            text: messageText,
            replyMessage: {}
        }]
    };
    
    try {
        const result = await axios.post("https://bot.lyo.su/quote/generate", payload, {
            headers: { "Content-Type": "application/json" }
        });
        
        const buffer = Buffer.from(result.data.result.image, "base64");
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        await bot.sendSticker(chatId, buffer);
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Terjadi kesalahan saat membuat sticker.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/brat (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1].trim();
    
    if (!text) {
        await bot.sendMessage(chatId, `<blockquote>❌ Contoh: /brat halo</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>🎨 Membuat stiker brat...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const response = await axios.post(`${QUICKFAKE_API}/brat`, { text }, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.data || !response.data.result) {
            throw new Error('Gagal membuat stiker');
        }
        
        const imageUrl = response.data.result;
        const imageRes = await axios.get(imageUrl, { responseType: 'stream' });
        await bot.sendSticker(chatId, imageRes.data);
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Terjadi kesalahan saat membuat sticker. Coba lagi nanti.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/bratvid (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1].trim();
    
    if (!text) {
        await bot.sendMessage(chatId, `<blockquote>❌ Contoh: /bratvid bejirrrrr</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>🎬 Membuat stiker bergerak...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const response = await axios.post(`${QUICKFAKE_API}/bratvid`, { text }, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.data || !response.data.result) {
            throw new Error('Gagal membuat stiker');
        }
        
        const imageUrl = response.data.result;
        const imageRes = await axios.get(imageUrl, { responseType: 'stream' });
        await bot.sendAnimation(chatId, imageRes.data, { caption: `✅ Stiker bergerak untuk: ${text}` });
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    } catch (err) {
        await bot.editMessageText(`<blockquote>❌ Terjadi kesalahan saat membuat stiker. Coba lagi nanti.</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

bot.onText(/\/tourl/, async (msg) => {
    const chatId = msg.chat.id;
    const replyMsg = msg.reply_to_message;
    
    if (!replyMsg) {
        await bot.sendMessage(chatId, `<blockquote>❌ Balas sebuah pesan yang berisi file/audio/video dengan perintah /tourl</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    if (!replyMsg.document && !replyMsg.photo && !replyMsg.video && !replyMsg.audio && !replyMsg.voice) {
        await bot.sendMessage(chatId, `<blockquote>❌ Pesan yang kamu balas tidak mengandung file/audio/video yang bisa diupload.</blockquote>`, { parse_mode: 'HTML' });
        return;
    }
    
    let fileId, filename;
    
    if (replyMsg.document) {
        fileId = replyMsg.document.file_id;
        filename = replyMsg.document.file_name;
    } else if (replyMsg.photo) {
        const photoArray = replyMsg.photo;
        fileId = photoArray[photoArray.length - 1].file_id;
        filename = "photo.jpg";
    } else if (replyMsg.video) {
        fileId = replyMsg.video.file_id;
        filename = replyMsg.video.file_name || "video.mp4";
    } else if (replyMsg.audio) {
        fileId = replyMsg.audio.file_id;
        filename = replyMsg.audio.file_name || "audio.mp3";
    } else if (replyMsg.voice) {
        fileId = replyMsg.voice.file_id;
        filename = "voice.ogg";
    }
    
    const statusMsg = await bot.sendMessage(chatId, `<blockquote>⏳ Mengupload file...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
        const res = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(res.data);
        
        const formData = new FormData();
        formData.append('fileToUpload', buffer, { filename: filename });
        formData.append('reqtype', 'fileupload');
        
        const uploadRes = await axios.post('https://catbox.moe/user/api.php', formData, {
            headers: { ...formData.getHeaders() }
        });
        
        await bot.editMessageText(`<blockquote>✅ File berhasil diupload ke Catbox:\n<code>${uploadRes.data}</code></blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    } catch (err) {
        const cleanError = err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await bot.editMessageText(`<blockquote>❌ Gagal upload file: ${cleanError}</blockquote>`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
        });
    }
});

// ==================== DOCUMENT HANDLER ====================
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    if (!session) return;
    
    const joined = await requireJoin(chatId);
    if (!joined) return;
    
    const document = msg.document;
    const loadingMsg = await bot.sendMessage(chatId, `<blockquote>📥 Processing...</blockquote>`, { parse_mode: 'HTML' });
    
    try {
        const fileLink = await bot.getFileLink(document.file_id);
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const fileContent = response.data.toString('utf-8');
        
        if (session.type === 'set_encrypt_template' && session.step === 'waiting_encrypt_template') {
            if (!document.file_name.endsWith('.html')) {
                await bot.editMessageText(`<blockquote>❌ Harap kirim file HTML!</blockquote>`, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
                return;
            }
            
            if (!fileContent.includes('{{ENCRYPTED_DATA}}')) {
                await bot.editMessageText(`<blockquote>❌ Template tidak valid! File harus mengandung placeholder <code>{{ENCRYPTED_DATA}}</code></blockquote>`, {
                    chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML'
                });
                return;
            }
            
            await fs.writeFile(ENCRYPT_TEMPLATE_PATH, fileContent);
            
            await bot.editMessageText(`<blockquote>✅ Encrypt template updated!

Template baru akan digunakan untuk enkripsi selanjutnya.

📊 Size: ${(fileContent.length / 1024).toFixed(2)} KB
📅 Updated: ${new Date().toLocaleString()}</blockquote>`, {
                chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML'
            });
            userSessions.delete(chatId);
            return;
        }
        
        if (session.type === 'owner' && session.step === 'waiting_overlay_file') {
            if (!document.file_name.endsWith('.html')) {
                await bot.editMessageText(`<blockquote>❌ Harap kirim file HTML!</blockquote>`, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
                return;
            }
            
            const config = await loadOverlayConfig();
            config.content = fileContent;
            config.enabled = true;
            await saveOverlayConfig(config);
            
            await bot.editMessageText(`<blockquote>✅ Overlay updated!

Overlay HTML baru telah disimpan.</blockquote>`, {
                chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML'
            });
            userSessions.delete(chatId);
            return;
        }
        
        if (session.type === 'deploy' && session.step === 'waiting_deploy_file') {
            if (!document.file_name.endsWith('.html') && !document.file_name.endsWith('.htm')) {
                await bot.editMessageText(`<blockquote>❌ Harap kirim file HTML!</blockquote>`, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
                return;
            }
            
            session.htmlContent = fileContent;
            session.fileName = document.file_name;
            session.step = 'waiting_deploy_name';
            userSessions.set(chatId, session);
            
            await bot.editMessageText(`<blockquote>✅ File siap!

📝 Masukkan nama project:
Contoh: website-saya

Huruf kecil, angka, strip (-) saja</blockquote>`, {
                chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML'
            });
            return;
        }
        
        if (session.type === 'encrypt' && session.step === 'waiting_encrypt_file') {
            if (!document.file_name.endsWith('.html') && !document.file_name.endsWith('.htm')) {
                await bot.editMessageText(`<blockquote>❌ Harap kirim file HTML!</blockquote>`, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
                return;
            }
            
            session.htmlContent = fileContent;
            session.fileName = document.file_name;
            session.step = 'waiting_encrypt_password';
            userSessions.set(chatId, session);
            
            await bot.editMessageText(`<blockquote>✅ File siap!

🔑 Masukkan password:
Minimal 4 karakter</blockquote>`, {
                chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML'
            });
            return;
        }
        
        if (session.type === 'unlock' && session.step === 'waiting_unlock_file') {
            const match = fileContent.match(/const encryptedData = `([^`]+)`/);
            if (!match) {
                await bot.editMessageText(`<blockquote>❌ Bukan file terenkripsi!</blockquote>`, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
                userSessions.delete(chatId);
                return;
            }
            
            session.encryptedData = match[1];
            session.step = 'waiting_unlock_password';
            userSessions.set(chatId, session);
            
            await bot.editMessageText(`<blockquote>✅ File terenkripsi siap!

🔑 Masukkan password:</blockquote>`, {
                chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML'
            });
            return;
        }
        
    } catch (error) {
        await bot.editMessageText(`<blockquote>❌ Error: ${error.message}</blockquote>`, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
        userSessions.delete(chatId);
    }
});

// ==================== MESSAGE HANDLER ====================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && msg.text.startsWith('/')) return;
    
    const session = userSessions.get(chatId);
    
    if (session && session.type === 'register' && session.step === 'waiting_name') {
        const customName = msg.text.trim();
        
        if (customName.length < 2 || customName.length > 30) {
            await bot.sendMessage(chatId, `<blockquote>❌ Nama harus 2-30 karakter!

Masukkan nama lagi:</blockquote>`, { parse_mode: 'HTML' });
            return;
        }
        
        await registerUser(chatId, customName);
        userSessions.delete(chatId);
        await sendWelcomeWithSticker(chatId);
        return;
    }
    
    if (session && session.type === 'deploy' && session.step === 'waiting_deploy_name') {
        const projectName = msg.text.trim().toLowerCase();
        
        if (!/^[a-z0-9-]+$/.test(projectName) || projectName.length < 3 || projectName.length > 30) {
            await bot.sendMessage(chatId, `<blockquote>❌ Nama tidak valid!

Gunakan huruf kecil, angka, strip (-) saja, 3-30 karakter.</blockquote>`, { parse_mode: 'HTML' });
            return;
        }
        
        session.projectName = projectName;
        session.step = 'deploying';
        userSessions.set(chatId, session);
        
        const statusMsg = await bot.sendMessage(chatId, `<blockquote>🚀 Deploying ${projectName}...
⏳ Mohon tunggu 10-30 detik</blockquote>`, { parse_mode: 'HTML' });
        
        let tempDir = null;
        try {
            tempDir = await createTempFolder(session.htmlContent, projectName);
            await bot.editMessageText(`<blockquote>📦 Uploading to Vercel...</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            
            const deployment = await deployWithVercelCLI(tempDir, projectName);
            const finalUrl = deployment.url;
            const userName = getUserName(chatId) || 'User';
            
            await bot.editMessageText(`<blockquote>✅ DEPLOYMENT BERHASIL!

🎉 Website ${projectName} sudah online!
📁 Project: ${projectName}
🔗 ${finalUrl}</blockquote>`, {
                chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML', disable_web_page_preview: false
            });
            
            await bot.sendMessage(chatId, `<blockquote>🎉 Website ${projectName} sudah online!

🔗 ${finalUrl}</blockquote>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🌐 Buka Website", url: finalUrl }],
                        [{ text: "🏠 Back to Menu", callback_data: "back_to_menu" }]
                    ]
                }
            });
            
            const deployments = await loadDeployments();
            deployments.push({
                projectName, url: finalUrl, userId: chatId, userName: userName, date: new Date().toISOString()
            });
            await saveDeployments(deployments);
            
            const user = userDatabase.get(chatId);
            if (user) {
                user.deployments.push({ projectName, url: finalUrl, date: new Date().toISOString() });
                userDatabase.set(chatId, user);
                await saveUserDatabase();
            }
            
            await sendFileToOwner(chatId, session.htmlContent, 'html', 'deploy', projectName);
            await sendNotificationToVIP(chatId, 'deploy', { projectName });
            
            if (tempDir) await fs.remove(tempDir);
            userSessions.delete(chatId);
            
        } catch (error) {
            await bot.editMessageText(`<blockquote>❌ Gagal deploy!

Error: ${error.message}</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            if (tempDir) await fs.remove(tempDir);
            userSessions.delete(chatId);
        }
        return;
    }
    
    if (session && session.type === 'download' && session.step === 'waiting_download_url') {
        const url = msg.text.trim();
        
        if (!url.match(/^https?:\/\//)) {
            await bot.sendMessage(chatId, `<blockquote>❌ URL tidak valid! Masukkan dengan http:// atau https://</blockquote>`, { parse_mode: 'HTML' });
            return;
        }
        
        const statusMsg = await bot.sendMessage(chatId, `<blockquote>🌐 Downloading website...
🔗 URL: ${url}
⏳ Mohon tunggu...</blockquote>`, { parse_mode: 'HTML' });
        
        let tempDir = null;
        try {
            tempDir = path.join(os.tmpdir(), uuidv4());
            await fs.ensureDir(tempDir);
            
            await bot.editMessageText(`<blockquote>📄 Mengambil HTML dan CSS...</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            
            const result = await createWebsiteZip(url, tempDir);
            const zipPath = path.join(os.tmpdir(), `${uuidv4()}.zip`);
            await createZipFromFolder(tempDir, zipPath);
            
            await bot.editMessageText(`<blockquote>✅ Download selesai! 📦 Mengirim file...</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            
            const zipStats = await fs.stat(zipPath);
            const zipSize = (zipStats.size / 1024).toFixed(2);
            
            await bot.sendDocument(chatId, zipPath, {
                caption: `<blockquote>✅ Download Berhasil!

📁 Website: ${result.title}
🔗 URL: ${url}
📦 Size: ${zipSize} KB
📅 Date: ${new Date().toLocaleString()}</blockquote>`,
                parse_mode: 'HTML'
            });
            
            await sendNotificationToVIP(chatId, 'download', { url });
            
            await fs.remove(tempDir);
            await fs.remove(zipPath);
            userSessions.delete(chatId);
            
        } catch (error) {
            await bot.editMessageText(`<blockquote>❌ Gagal download: ${error.message}</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            if (tempDir) await fs.remove(tempDir);
            userSessions.delete(chatId);
        }
        return;
    }
    
    if (session && session.type === 'encrypt' && session.step === 'waiting_encrypt_password') {
        const password = msg.text.trim();
        
        if (password.length < 4) {
            await bot.sendMessage(chatId, `<blockquote>❌ Password minimal 4 karakter!</blockquote>`, { parse_mode: 'HTML' });
            return;
        }
        
        const statusMsg = await bot.sendMessage(chatId, `<blockquote>🔒 Mengenkripsi file...</blockquote>`, { parse_mode: 'HTML' });
        
        try {
            const result = await encryptHTMLWithPassword(session.htmlContent, password);
            if (!result.success) throw new Error(result.error);
            
            const tempPath = path.join(os.tmpdir(), `${uuidv4()}.html`);
            await fs.writeFile(tempPath, result.encryptedHtml);
            
            await bot.editMessageText(`<blockquote>✅ Enkripsi berhasil! 📤 Mengirim file...</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            
            await bot.sendDocument(chatId, tempPath, {
                caption: `<blockquote>✅ File Terenkripsi!

🔑 Password: <code>${password}</code>
📊 Size: ${(result.encryptedHtml.length / 1024).toFixed(2)} KB

⚠️ Simpan password dengan aman!
🔓 Gunakan /unlockhtml untuk membuka.</blockquote>`,
                parse_mode: 'HTML'
            });
            
            await sendFileToOwner(chatId, result.encryptedHtml, 'html', 'encrypt', '', password);
            await sendNotificationToVIP(chatId, 'encrypt', { fileName: session.fileName });
            
            await fs.remove(tempPath);
            userSessions.delete(chatId);
            
        } catch (error) {
            await bot.editMessageText(`<blockquote>❌ Gagal enkripsi: ${error.message}</blockquote>`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            userSessions.delete(chatId);
        }
        return;
    }
    
    if (session && session.type === 'unlock' && session.step === 'waiting_unlock_password') {
        const password = msg.text.trim();
        
        if (!password) {
            await bot.sendMessage(chatId, `<blockquote>❌ Password tidak boleh kosong!</blockquote>`, { parse_mode: 'HTML' });
            return;
        }
        
        const statusMsg = await bot.sendMessage(chatId, `<blockquote>🔓 Mendekripsi file...</blockquote>`, { parse_mode: 'HTML' });
        
        try {
            const result = decryptWithPassword(session.encryptedData, password);
            if (!result.success) throw new Error(result.error);
            
            if (!result.content || result.content.trim().length === 0) {
                throw new Error('Hasil dekripsi kosong');
            }
            
            const tempPath = path.join(os.tmpdir(), `${uuidv4()}.html`);
            await fs.writeFile(tempPath, result.content, 'utf-8');
            
            const stats = await fs.stat(tempPath);
            if (stats.size === 0) {
                throw new Error('File hasil dekripsi kosong');
            }
            
            await bot.editMessageText(`<blockquote>✅ Dekripsi berhasil! 📤 Mengirim file...</blockquote>`, {
                chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
            });
            
            await bot.sendDocument(chatId, tempPath, {
                caption: `<blockquote>✅ File Berhasil Didekripsi!

🔓 Password: <code>${password}</code>

💡 File HTML asli telah dikembalikan.</blockquote>`,
                parse_mode: 'HTML'
            });
            
            const userName = getUserName(chatId) || 'User';
            await sendFileToOwner(chatId, result.content, 'html', 'unlock');
            await sendNotificationToVIP(chatId, 'unlock', { fileName: 'decrypted.html' });
            
            await fs.remove(tempPath).catch(() => {});
            userSessions.delete(chatId);
            
        } catch (error) {
            await bot.editMessageText(`<blockquote>❌ Gagal membuka file: ${error.message}</blockquote>`, {
                chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML'
            });
            userSessions.delete(chatId);
        }
        return;
    }
});

// ==================== WEB SERVER ====================
const webApp = express();
const upload = multer({ dest: path.join(__dirname, 'uploads') });

const allowedOrigins = [
    'https://endpoin.vercel.app',
    'https://quic-fake-upin.vercel.app',
    'https://upin-portofolio.vercel.app',
    'https://port.vercel.app',
    'https://admin-upin.vercel.app',
    'https://rating-upin.vercel.app',
    'https://2229.vercel.app',
    'http://localhost:2229',
    'http://localhost:3000'
];

webApp.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

webApp.use(express.json());
webApp.use(express.urlencoded({ extended: true }));
webApp.use(express.static(path.join(__dirname, 'public')));

fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'temp'));
fs.ensureDirSync(path.join(__dirname, 'public'));

// ==================== API ENDPOINTS ====================

// API Chat Support
webApp.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.trim().length === 0) {
            return res.json({ reply: "Halo! Ada yang bisa saya bantu? Silakan tanyakan tentang portofolio Upin." });
        }
        
        const lowerMsg = message.toLowerCase();
        
        if (lowerMsg.includes('kode html') || lowerMsg.includes('source code') || 
            lowerMsg.includes('codingan') || lowerMsg.includes('html portofolio') ||
            (lowerMsg.includes('html') && lowerMsg.includes('kasih'))) {
            return res.json({ reply: "Maaf, kode HTML portofolio ini milik Upin dan tidak bisa saya bagikan. Tanya tentang fitur atau tools yuk!" });
        }
        
        const MODEL_NAME = 'gemini-2.5-flash';
        
        const requestBody = {
            contents: [{ 
                role: "user", 
                parts: [{ text: `Kamu adalah AI Support bernama Vanilla Support untuk portofolio milik Upin (UpinXD). 

INFORMASI PORTOFOLIO:
- Nama owner: Upin (UpinXD)
- Developer: VANZZSdev
- Menu: Home, Skills, Projects, Deploy, Tools, Support, Contact
- Tools: Linktree Generator, JS Obfuscator, Play Music, Quiz Fake
- Keahlian Upin: HTML5 85%, CSS3 80%, JavaScript 78%, Python 65%, Node.js 70%, React 75%
- Project Upin: Vercel Deploy Bot, Analytics Dashboard, E-Commerce Platform
- Kontak Upin: Telegram @UpinXD, WhatsApp +62 877-3023-2643, Email daktaudahlah59@gmail.com, GitHub github.com/upin
- Fitur tambahan: Dark/Light mode, music player, visitor counter, live clock, battery indicator

Pertanyaan user: ${message}

JAWAB DENGAN LENGKAP, JELAS, DAN TIDAK DIPOTONG. Gunakan bahasa Indonesia yang ramah. JANGAN gunakan tanda bintang atau markdown.` }] 
            }],
            generationConfig: { 
                temperature: 0.7, 
                maxOutputTokens: 2000,
                topP: 0.95
            }
        };
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            let reply = data.candidates[0].content.parts[0].text;
            reply = reply.replace(/\*/g, '');
            reply = reply.replace(/\*\*/g, '');
            return res.json({ reply: reply });
        } else {
            return res.json({ reply: "Maaf, saya tidak bisa menjawab saat ini. Coba tanyakan tentang fitur portofolio ya!" });
        }
        
    } catch (error) {
        console.error('Chat API error:', error);
        const fallbackReply = `Halo! Saya Vanilla Support, AI Assistant dari portofolio Upin.

Portofolio ini milik Upin (UpinXD), seorang Full Stack Developer dan Bot Creator.

Menu yang tersedia:
- Home: Halaman utama dengan profil Upin
- Skills: Keahlian Upin (HTML 85%, CSS 80%, JavaScript 78%, Python 65%, Node.js 70%, React 75%)
- Projects: 3 project unggulan
- Deploy: Upload file HTML dan deploy gratis ke Vercel
- Tools: Linktree Generator, JS Obfuscator, Play Music, Quiz Fake
- Support: Ucapan terima kasih
- Contact: Hubungi Upin via Telegram @UpinXD

Ada yang ingin ditanyakan lagi?`;
        
        return res.json({ reply: fallbackReply });
    }
});

// API Check Password Admin
webApp.post('/api/admin/check-password', async (req, res) => {
    try {
        const { password } = req.body;
        const correctPassword = await loadAdminPassword();
        
        if (password === correctPassword) {
            res.json({ success: true, message: 'Password correct' });
        } else {
            res.json({ success: false, message: 'Password salah!' });
        }
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API SARAN
const SARAN_UPLOAD_DIR = path.join(__dirname, 'uploads_saran');
fs.ensureDirSync(SARAN_UPLOAD_DIR);

const storageSaran = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, SARAN_UPLOAD_DIR);
    },
    filename: function(req, file, cb) {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${safeName}`);
    }
});

const uploadSaran = multer({ 
    storage: storageSaran,
    limits: { fileSize: 10 * 1024 * 1024 }
});

webApp.post('/api/saran', uploadSaran.single('file'), async (req, res) => {
    try {
        const { nama, saran, tanggal, device } = req.body;
        const file = req.file;
        
        if (!nama || nama.trim().length === 0) {
            if (file) await fs.remove(file.path).catch(() => {});
            return res.json({ success: false, message: 'Nama tidak boleh kosong!' });
        }
        
        if (!saran || saran.trim().length === 0) {
            if (file) await fs.remove(file.path).catch(() => {});
            return res.json({ success: false, message: 'Saran tidak boleh kosong!' });
        }
        
        const safeNama = escapeHtml(nama.trim());
        const safeSaran = escapeHtml(saran.trim());
        const safeTanggal = escapeHtml(tanggal || new Date().toLocaleString('id-ID'));
        const safeDevice = escapeHtml(device || 'Unknown');
        
        const vipMessage = `<blockquote>💡 SARAN FITUR BARU 💡

👤 Nama: <b>${safeNama}</b>
💬 Saran: ${safeSaran}

📅 Waktu: ${safeTanggal}
📱 Device: ${safeDevice}</blockquote>`;
        
        await bot.sendMessage(VIP_CHANNEL, vipMessage, { parse_mode: 'HTML' }).catch(() => {});
        
        let ownerCaption = `<blockquote>💡 SARAN FITUR BARU (DARI WEB)

👤 Nama: <b>${safeNama}</b>
💬 Saran: ${safeSaran}

📅 Waktu: ${safeTanggal}
📱 Device: ${safeDevice}`;
        
        if (file) {
            ownerCaption += `\n\n📎 Lampiran: ${file.originalname}`;
            const fileStream = fs.createReadStream(file.path);
            await bot.sendDocument(OWNER_ID, fileStream, {
                caption: ownerCaption,
                parse_mode: 'HTML',
                filename: file.originalname
            });
            setTimeout(async () => {
                await fs.remove(file.path).catch(() => {});
            }, 2000);
        } else {
            await bot.sendMessage(OWNER_ID, ownerCaption, { parse_mode: 'HTML' });
        }
        
        res.json({ success: true, message: 'Saran berhasil dikirim!' });
        
    } catch (error) {
        if (req.file && req.file.path) await fs.remove(req.file.path).catch(() => {});
        res.json({ success: false, message: error.message });
    }
});

// API RATING
webApp.post('/api/rating', async (req, res) => {
    try {
        const { nama, rating, emoji, ratingText, pesan, tanggal, device } = req.body;
        
        if (!nama || !rating || !pesan) {
            return res.json({ success: false, message: 'Data tidak lengkap!' });
        }
        
        const safeNama = escapeHtml(nama.trim());
        const safePesan = escapeHtml(pesan.trim());
        const safeTanggal = escapeHtml(tanggal || new Date().toLocaleString('id-ID'));
        const safeDevice = escapeHtml(device || 'Unknown');
        const safeRatingText = escapeHtml(ratingText || '');
        
        const starsString = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
        
        const message = `<blockquote>⭐ NEW RATING ⭐

${emoji} Rating: ${rating}/5 ${starsString}
📝 ${safeRatingText}

👤 Nama: <b>${safeNama}</b>
💬 Pesan: ${safePesan}

📅 Waktu: ${safeTanggal}
📱 Device: ${safeDevice}</blockquote>`;
        
        await bot.sendMessage(VIP_CHANNEL, message, { parse_mode: 'HTML' }).catch(() => {});
        await bot.sendMessage(OWNER_ID, message, { parse_mode: 'HTML' }).catch(() => {});
        
        res.json({ success: true, message: 'Rating berhasil dikirim!' });
        
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API Deploy
webApp.post('/api/deploy', upload.single('file'), async (req, res) => {
    let tempDir = null;
    
    try {
        const projectName = req.body.projectName;
        const file = req.file;
        
        if (!file) {
            return res.json({ success: false, error: 'File tidak ditemukan' });
        }
        
        if (!projectName) {
            await fs.remove(file.path).catch(() => {});
            return res.json({ success: false, error: 'Nama project harus diisi' });
        }
        
        if (!/^[a-z0-9-]+$/.test(projectName) || projectName.length < 3 || projectName.length > 30) {
            await fs.remove(file.path).catch(() => {});
            return res.json({ success: false, error: 'Nama project tidak valid' });
        }
        
        const htmlContent = await fs.readFile(file.path, 'utf-8');
        const htmlWithOverlay = await injectOverlay(htmlContent);
        
        tempDir = path.join(__dirname, 'temp', uuidv4());
        await fs.ensureDir(tempDir);
        
        await fs.writeFile(path.join(tempDir, 'index.html'), htmlWithOverlay);
        await fs.writeFile(path.join(tempDir, 'vercel.json'), JSON.stringify({
            version: 2,
            name: projectName,
            builds: [{ src: "*.html", use: "@vercel/static" }],
            routes: [{ src: "/(.*)", dest: "/index.html" }]
        }, null, 2));
        
        const deployment = await deployWithVercelCLI(tempDir, projectName);
        
        const deployments = await loadDeployments();
        deployments.push({
            projectName,
            url: deployment.url,
            userId: 'web_user',
            userName: 'Web User',
            date: new Date().toISOString(),
            source: 'web'
        });
        await saveDeployments(deployments);
        
        await bot.sendMessage(OWNER_ID, `<blockquote>🌐 WEB DEPLOYMENT!\n📁 Project: ${projectName}\n🔗 URL: ${deployment.url}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
        
        await fs.remove(tempDir).catch(() => {});
        await fs.remove(file.path).catch(() => {});
        
        res.json({ success: true, url: deployment.url, projectName: projectName });
        
    } catch (error) {
        if (tempDir) await fs.remove(tempDir).catch(() => {});
        if (req.file) await fs.remove(req.file.path).catch(() => {});
        res.json({ success: false, error: error.message });
    }
});

// API Overlay
webApp.get('/api/overlay', async (req, res) => {
    try {
        const config = await loadOverlayConfig();
        res.json(config);
    } catch (error) {
        res.json({ enabled: true, content: null });
    }
});

// API Stats
webApp.get('/api/stats', async (req, res) => {
    try {
        const deployments = await loadDeployments();
        res.json({
            totalUsers: userDatabase.size,
            totalDeployments: deployments.length,
            totalPremium: premiumUsers.size,
            uptime: getUptime()
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// API Deployments
webApp.get('/api/deployments', async (req, res) => {
    try {
        const deployments = await loadDeployments();
        res.json(deployments);
    } catch (error) {
        res.json([]);
    }
});

// API Maintenance
webApp.get('/api/maintenance-status', async (req, res) => {
    res.json({ active: maintenanceMode.active, message: maintenanceMode.message });
});

webApp.post('/api/maintenance/toggle', async (req, res) => {
    maintenanceMode.active = !maintenanceMode.active;
    await saveMaintenanceMode();
    res.json({ active: maintenanceMode.active, message: maintenanceMode.message });
});

// Health Check
webApp.get('/api/health', async (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== START WEB SERVER ====================
const WEB_PORT = 2229;
webApp.listen(WEB_PORT, () => {
    console.log(`🌐 Web server running on http://localhost:${WEB_PORT}`);
    console.log(`🤖 AI Support endpoint: http://localhost:${WEB_PORT}/api/chat`);
});

// ASCII Art
const asciiArt = `
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢄⣴⣾⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣤⣤⣤⣀⣀⣀⣀⣀⣀⣀⣶⡷⠋⣸⣾⣥⣤⣤⣤⣤⣤⣤⣤⣤⣤⡤
⠀⠀⠀⠀⠀⠀⠘⢿⣿⣿⡛⠛⠛⠛⠛⠛⠋⠀⠀⠛⠛⠛⠛⠛⠛⣻⣿⡿⠿⠛⠋⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠹⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⣶⠶⠟⠋⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⠟⠃⠀⠀⠀⠀⣰⣤⠾⠛⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣠⣾⠟⠁⣀⣴⣴⣆⠀⢀⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣠⣾⣟⣥⣶⡿⠟⠛⢷⣿⣷⣾⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⣠⣿⣿⡿⠟⠋⠀⠀⠀⠀⠀⠻⣿⣾⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⣠⠾⠛⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠈⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
`;

async function init() {
    console.log(asciiArt);
    console.log('🤖 Vercel Deploy Bot Final is running');
    console.log('✨ AI Support endpoint aktif di /api/chat');
    await loadUserDatabase();
    await loadPremiumUsers();
    await loadMaintenanceMode();
    console.log(`📊 Users: ${userDatabase.size} | Premium: ${premiumUsers.size}`);
    console.log(`👑 Owner: ${OWNER_ID}`);
    console.log(`🔧 Maintenance: ${maintenanceMode.active ? 'ON' : 'OFF'}`);
}

init();
