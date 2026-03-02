/* BAWX PROJECT V42 - THE ULTIMATE EDITION (FINANCE FIX)
   - Engine: Lenwy (ESM + Baileys v7)
   - Logic: Multi-Select, Persistent Queue, Anti-Bentrok
   - Fix: .plussaldo, .minsaldo & .setharga validation
*/

import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, getContentType, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import os from "os";

// ============================================================
// 👇 NOMOR BOT ANDA
// ============================================================
const NOMOR_BOT_ANDA = "628553056669"; 
// ============================================================

// --- KONFIGURASI ---
const NOMOR_SUPPLIER = '62895348020123'; 
const ID_GRUP_TARGET = ['120363406018124885@g.us', '120363407313936563@g.us']; 
const SUPER_ADMINS = ['628553056669', '7289096413331', '175058655965193']; 

// 👇 KONFIGURASI GAMBAR
const LOCAL_MENU_PATH = './menu.jpg'; 
const FALLBACK_MENU_URL = 'https://files.catbox.moe/gdg5yl.jpg'; 
const QRIS_IMAGE_URL = 'https://files.catbox.moe/gdg5yl.jpg'; 

// --- DATABASE ---
const DB_FILE = './database.json'; 
const HISTORY_FILE = './history.json';
const FINANCE_FILE = './finance.json';
const ADMINS_FILE = './admins.json'; 

// --- VARIABLES ---
const sessions = {}; 
let isStoreOpen = true; 
let lastUser = null;
let gateOpenUntil = 0; 
const pendingTransactions = {}; 

// --- HELPERS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getBuffer = async (url) => { try { return (await axios({ method: 'get', url, responseType: 'arraybuffer' })).data; } catch (e) { return null; } };
const getMenuImage = async () => { try { return fs.existsSync(LOCAL_MENU_PATH) ? fs.readFileSync(LOCAL_MENU_PATH) : (await axios({ url: FALLBACK_MENU_URL, responseType: 'arraybuffer' })).data; } catch (e) { return null; } };

function loadAdmins() { try { if (!fs.existsSync(ADMINS_FILE)) { fs.writeFileSync(ADMINS_FILE, JSON.stringify(SUPER_ADMINS, null, 2)); return SUPER_ADMINS; } return JSON.parse(fs.readFileSync(ADMINS_FILE)); } catch { return []; } }
function saveAdmins(data) { fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2)); }
function loadDatabase() { try { if (!fs.existsSync(DB_FILE)) { fs.writeFileSync(DB_FILE, '{}'); return {}; } return JSON.parse(fs.readFileSync(DB_FILE)); } catch { return {}; } }
function saveDatabase(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function loadHistory() { try { if (!fs.existsSync(HISTORY_FILE)) { fs.writeFileSync(HISTORY_FILE, '{}'); return {}; } return JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch { return {}; } }
function saveHistory(data) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2)); }
function addHistory(jid, number, kode, plu) { const db = loadHistory(); if (!db[jid]) db[jid] = []; db[jid].unshift({ number, kode, plu, timestamp: Date.now(), readableTime: new Date().toLocaleString('id-ID') }); saveHistory(db); }
function loadFinance() { try { if (!fs.existsSync(FINANCE_FILE)) { fs.writeFileSync(FINANCE_FILE, '{}'); return {}; } return JSON.parse(fs.readFileSync(FINANCE_FILE)); } catch { return {}; } }
function saveFinance(data) { fs.writeFileSync(FINANCE_FILE, JSON.stringify(data, null, 2)); }
const rupiah = (number) => { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(number); }
function getSession(jid) { if (!sessions[jid]) sessions[jid] = { status: 'IDLE', selectedNumbers: [], kodeToko: '', plu: '' }; return sessions[jid]; }
const log = { trx: (msg) => console.log(chalk.bgGreen.black(` TRX `) + ` ${msg}`) };

const parseIndices = (input) => {
    const sel = [];
    const cleanInput = input.replace(/\s/g, ''); 
    if (cleanInput.includes('-')) {
        const [s, e] = cleanInput.split('-').map(Number);
        if (!isNaN(s) && !isNaN(e)) for (let i = s; i <= e; i++) sel.push(i - 1);
    } else if (cleanInput.includes(',')) {
        cleanInput.split(',').forEach(n => { if (!isNaN(n)) sel.push(Number(n) - 1); });
    } else {
        if (!isNaN(cleanInput)) sel.push(Number(cleanInput) - 1);
    }
    return sel;
};

// --- MAIN FUNCTION ---
async function startBot() {
    console.log(chalk.green.bold('\n[SYSTEM] Memulai BAWX PROJECT Ultimate...'));

    const { state, saveCreds } = await useMultiFileAuthState("session_auth");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        version,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    if (!sock.authState.creds.registered) {
        console.log(chalk.cyan(`\n[INFO] Meminta Pairing Code: ${NOMOR_BOT_ANDA}...`));
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NOMOR_BOT_ANDA);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(chalk.green.bold("\n================================"));
                console.log(chalk.green.bold("   KODE PAIRING ANDA:"));
                console.log(chalk.white.bgGreen.bold(`   ${code}   `));
                console.log(chalk.green.bold("================================\n"));
            } catch (err) {
                console.error(chalk.red("[ERROR] Gagal minta kode."));
            }
        }, 4000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(chalk.red(`[KONEKSI] Putus (${reason}). Reconnecting...`));
            if (reason !== DisconnectReason.loggedOut) startBot();
            else console.log(chalk.red("[FATAL] Logout. Hapus session_auth."));
        } else if (connection === "open") {
            console.log(chalk.green("[SUKSES] Bot Terhubung!"));
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return; 

            const chatJid = msg.key.remoteJid;
            const isGroup = chatJid.endsWith('@g.us');
            const senderJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
            const senderNum = senderJid ? senderJid.split('@')[0] : 'Unknown';
            const pushname = msg.pushName || "User";

            const type = getContentType(msg.message);
            let body = (type === 'conversation') ? msg.message.conversation :
                       (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text :
                       (type === 'imageMessage') ? msg.message.imageMessage.caption : '';
            const trimmedBody = body ? body.trim() : '';
            if (!trimmedBody) return;

            if (!isGroup) console.log(chalk.magenta(`[PESAN] ${senderNum}: ${trimmedBody.substring(0, 30)}`));
            if (isGroup && !ID_GRUP_TARGET.includes(chatJid)) return; 

            // SUPPLIER HANDLING
            if (senderNum === NOMOR_SUPPLIER) {
                let forwardedTo = new Set(); 
                let foundTarget = false;

                for (const num in pendingTransactions) {
                    if (body.includes(num)) {
                        const targetJid = pendingTransactions[num].jid;
                        if (!forwardedTo.has(targetJid)) {
                            await sock.sendMessage(targetJid, { text: `[SERVER]\n\n${body}` });
                            log.trx(`Balasan -> Pemesan (${num} : ${targetJid})`);
                            forwardedTo.add(targetJid);
                        }
                        foundTarget = true;
                    }
                }
                if (!foundTarget && lastUser && Date.now() < gateOpenUntil) {
                    await sock.sendMessage(lastUser, { text: `[SERVER]\n\n${body}` });
                }
                for (const num in pendingTransactions) {
                    if (Date.now() - pendingTransactions[num].time > 900000) delete pendingTransactions[num];
                }
                return;
            }

            const userSession = getSession(senderJid); 
            const isCommand = trimmedBody.startsWith('.') || trimmedBody.startsWith('/');
            const isSessionActive = userSession.status !== 'IDLE';

            if (!isCommand && !isSessionActive) return; 

            const command = trimmedBody.split(' ')[0].toLowerCase();
            const args = trimmedBody.substring(command.length).trim();
            const admins = loadAdmins();
            const isAdmin = SUPER_ADMINS.includes(senderNum) || admins.includes(senderNum);

            // ==========================================
            //           FITUR TAMPILAN
            // ==========================================
            if (command === '.ping') {
                let ppUrl; try { ppUrl = await sock.profilePictureUrl(senderJid, 'image'); } catch { ppUrl = 'https://i.ibb.co/3057az2/avatar.png'; }
                const ppBuffer = await getBuffer(ppUrl);
                const menuBuffer = await getMenuImage();

                const fcontact = {
                    key: { fromMe: false, participant: `0@s.whatsapp.net`, remoteJid: 'status@broadcast' },
                    message: { contactMessage: { displayName: "WhatsApp", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${pushname};;;\nFN:${pushname}\nitem1.TEL;waid=${senderNum}:${senderNum}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`, jpegThumbnail: ppBuffer } }
                };

                const timestamp = msg.messageTimestamp ? (msg.messageTimestamp * 1000) : Date.now();
                const latency = Date.now() - timestamp;
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                const hostname = os.hostname();
                const osType = os.type();
                const osRelease = os.release();
                const osArch = os.arch();
                let ipAddress = '127.0.0.1';
                const interfaces = os.networkInterfaces();
                for (const devName in interfaces) {
                    for (const iface of interfaces[devName]) { if (iface.family === 'IPv4' && !iface.internal) { ipAddress = iface.address; break; } }
                    if (ipAddress !== '127.0.0.1') break;
                }
                const cpuModel = os.cpus()[0].model;
                const cpuCore = os.cpus().length;
                const loadAvg = os.loadavg()[0];
                const cpuUsage = ((loadAvg / cpuCore) * 100).toFixed(2);
                const totalRam = os.totalmem();
                const freeRam = os.freemem();
                const usedRam = totalRam - freeRam;
                const usedRamMB = (usedRam / 1024 / 1024).toFixed(2);
                const totalRamMB = (totalRam / 1024 / 1024).toFixed(2);
                const usedRamGB = (usedRam / 1024 / 1024 / 1024).toFixed(2);
                const totalRamGB = (totalRam / 1024 / 1024 / 1024).toFixed(2);
                const ramPercent = ((usedRam / totalRam) * 100).toFixed(2);

                const pingText = `System Monitoring Report\n© BAWX PROJECT\n\n┌──[ PING STATUS ]──┐\n\n📠 Latency (Real)\n↳ ${latency} ms\n\n⏱️ Runtime\n↳ ${days} Hari ${hours} Jam ${minutes} Menit ${seconds} Detik\n\n🖥️ System Info\n↳ Hostname : ${hostname}\n↳ IP : ${ipAddress}\n↳ OS : ${osType.toLowerCase()} ${osRelease} (${osArch})\n\n⚙️ CPU Info\n↳ Model : ${cpuModel}\n↳ Core : ${cpuCore}\n↳ Usage : ${cpuUsage}%\n\n💾 Memory\n↳ Used : ${usedRamMB} MB / ${totalRamMB} MB (${ramPercent}%)\n↳ GB : ${usedRamGB} GB / ${totalRamGB} GB\n\n👑 Owner\n↳ 085790374090\n\n🤖 Bot\n↳ BAWX PROJECT\n└───────────────────┘`;

                if (menuBuffer) await sock.sendMessage(chatJid, { image: menuBuffer, caption: pingText }, { quoted: fcontact }); 
                else await sock.sendMessage(chatJid, { text: "[ERROR] Gambar tidak ditemukan.\n\n" + pingText }, { quoted: fcontact }); 
                return;
            }

            if (command === '.menu' || command === '.help') {
                let ppUrl; try { ppUrl = await sock.profilePictureUrl(senderJid, 'image'); } catch { ppUrl = 'https://i.ibb.co/3057az2/avatar.png'; }
                const ppBuffer = await getBuffer(ppUrl);
                const menuBuffer = await getMenuImage();

                const now = new Date();
                const jam = now.getHours();
                let ucapan = (jam >= 3 && jam < 11) ? 'Pagi' : (jam >= 11 && jam < 15) ? 'Siang' : (jam >= 15 && jam < 18) ? 'Sore' : 'Malam';
                const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][now.getDay()];
                const tanggal = now.getDate();
                const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][now.getMonth()];
                const tahun = now.getFullYear();
                const waktu = now.toLocaleTimeString('id-ID');
                const statusToko = isStoreOpen ? "BUKA [V]" : "TUTUP [X]";

                let menuText = `
Halo @${senderNum}
${ucapan}, Selamat ${ucapan}.

*Waktu:* ${hari}, ${tanggal} ${bulan} ${tahun}
*Jam:* ${waktu}
*Status Toko:* ${statusToko}

┏ *[ MANAJEMEN DATA ]*
┣ .add [nomor]
┣ .list (Cek Status)
┗ .hapus [urutan]

┏ *[ TRANSAKSI ]*
┣ .co (Multi-PLU / Normal)
┣ .pin (Transaksi PIN Cepat)
┣ .history (Lihat Semua)
┣ .delhis (Hapus History)
┗ .batal (Reset Sesi)

┏ *[ LAINNYA ]*
┣ .pay (Info Bayar)
┣ .hadiah
┗ .ping (Cek Server)
`;
                if (isAdmin) menuText += `\n┏ *[ MENU ADMIN ]*\n┣ .setharga .dompet .laporan\n┣ .plussaldo .minsaldo\n┣ .addadmin .deladmin\n┣ .bc [pesan]\n┗ .open / .close\n`;

                const fcontact = {
                    key: { fromMe: false, participant: `0@s.whatsapp.net`, remoteJid: 'status@broadcast' },
                    message: { contactMessage: { displayName: "WhatsApp", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${pushname};;;\nFN:${pushname}\nitem1.TEL;waid=${senderNum}:${senderNum}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`, jpegThumbnail: ppBuffer } }
                };

                if (menuBuffer) await sock.sendMessage(chatJid, { image: menuBuffer, caption: menuText, mentions: [senderJid] }, { quoted: fcontact }); 
                else await sock.sendMessage(chatJid, { text: "[ERROR] Gambar tidak ditemukan.\n\n" + menuText }, { quoted: fcontact }); 
                return; 
            }

            // ==========================================
            //           FITUR ADMINISTRASI
            // ==========================================
            if (command === '.restart' && isAdmin) { await sock.sendMessage(chatJid, { text: '[SYSTEM] Restarting...' }); setTimeout(() => { process.exit() }, 2000); return; }
            if (command === '.pay') {
                const captionQris = `[ 💳 PEMBAYARAN OTOMATIS ]\n\nSilakan transfer sesuai nominal yang disepakati.\nGunakan QRIS di atas atau salin nomor rekening di bawah ini.`;
                try { await sock.sendMessage(chatJid, { image: { url: QRIS_IMAGE_URL }, caption: captionQris }, { quoted: msg }); } catch { await sock.sendMessage(chatJid, { text: captionQris }, { quoted: msg }); }
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(chatJid, { text: `7901479538` }); await sock.sendMessage(chatJid, { text: `^ A.N RACHMAD HIDAYAT (BCA)` });
                await sock.sendMessage(chatJid, { text: `085790374090` }); await sock.sendMessage(chatJid, { text: `^ A.N RACHMAD HIDAYAT (ISAKU/DANA/OVO)` });
                return;
            }
            if (command === '.open') { if (!isAdmin) return; isStoreOpen = true; await sock.sendMessage(chatJid, { text: '[INFO] Toko DIBUKA.' }); return; }
            if (command === '.close') { if (!isAdmin) return; isStoreOpen = false; await sock.sendMessage(chatJid, { text: '[INFO] Toko DITUTUP.' }); return; }
            
            // 👇 FIX: FITUR KEUANGAN TERBARU
            if (command === '.setharga') {
                if (!isAdmin) return; 
                const [b, s] = args.split(' ').map(Number); 
                if (!b || !s) { await sock.sendMessage(chatJid, { text: '[ERROR] Format salah!\nContoh: .setharga 5000 7000' }); return; }
                const f = loadFinance(); if (!f[chatJid]) f[chatJid] = { balance: 0, buy: 0, sell: 0, sold: 0, omzet: 0, profit: 0 };
                f[chatJid].buy = b; f[chatJid].sell = s; saveFinance(f); 
                await sock.sendMessage(chatJid, { text: `✅ [SUKSES] Harga Disimpan\n\nModal: ${rupiah(b)}\nJual: ${rupiah(s)}\n\n*(Mulai sekarang laporan akan dicatat)*` }); return;
            }
            if (command === '.plussaldo') {
                if (!isAdmin) return; 
                const j = parseInt(args.replace(/\D/g, '')); if (!j) { await sock.sendMessage(chatJid, { text: 'Format: .plussaldo 10000' }); return; }
                const f = loadFinance(); if (!f[chatJid]) f[chatJid] = { balance: 0, buy: 0, sell: 0, sold: 0, omzet: 0, profit: 0 };
                f[chatJid].balance += j; saveFinance(f); await sock.sendMessage(chatJid, { text: `✅ [SUKSES] +${rupiah(j)}\nTotal Saldo: ${rupiah(f[chatJid].balance)}` }); return;
            }
            if (command === '.minsaldo') {
                if (!isAdmin) return; 
                const j = parseInt(args.replace(/\D/g, '')); if (!j) { await sock.sendMessage(chatJid, { text: 'Format: .minsaldo 10000' }); return; }
                const f = loadFinance(); if (!f[chatJid]) f[chatJid] = { balance: 0, buy: 0, sell: 0, sold: 0, omzet: 0, profit: 0 };
                f[chatJid].balance -= j; saveFinance(f); await sock.sendMessage(chatJid, { text: `✅ [SUKSES] -${rupiah(j)}\nTotal Saldo: ${rupiah(f[chatJid].balance)}` }); return;
            }
            if (command === '.dompet') { if (!isAdmin) return; const f = loadFinance()[chatJid] || { balance: 0 }; await sock.sendMessage(chatJid, { text: `Saldo: ${rupiah(f.balance)}` }); return; }
            if (command === '.laporan') { if (!isAdmin) return; const d = loadFinance()[chatJid] || { balance: 0, sold: 0, profit: 0 }; await sock.sendMessage(chatJid, { text: `Terjual: ${d.sold}\nProfit: ${rupiah(d.profit)}\nSaldo: ${rupiah(d.balance)}` }); return; }
            
            // ==========================================
            //           MANAJEMEN DATA & HISTORY
            // ==========================================
            if (command === '.add') {
                const db = loadDatabase(); if (!db[chatJid]) db[chatJid] = [];
                args.split(/[\s,\n]+/).forEach(n => {
                    let c = n.replace(/\D/g, ''); if(c.length>9) { if(c.startsWith('62')) c='0'+c.substring(2); if(!db[chatJid].includes(c)) db[chatJid].push(c); }
                });
                saveDatabase(db); await sock.sendMessage(chatJid, { text: 'Disimpan.' }); return;
            }
            if (command === '.list') {
                const nums = loadDatabase()[chatJid] || []; if(nums.length===0) { await sock.sendMessage(chatJid, {text: 'Kosong'}); return; }
                const hist = loadHistory(); const userHist = hist[chatJid] || []; const usedNumbers = new Set(userHist.map(item => item.number));
                let t = '[ LIST AKUN ]\n'; 
                nums.forEach((n,i) => { const status = usedNumbers.has(n) ? 'OFF [X]' : 'ON [V]'; t += `${i+1}. ${n} - ${status}\n`; });
                await sock.sendMessage(chatJid, { text: t }); return;
            }
            if (command === '.hapus') {
                const db = loadDatabase(); let nums = db[chatJid] || [];
                const idxs = parseIndices(args);
                db[chatJid] = nums.filter((_, i) => !idxs.includes(i));
                saveDatabase(db); await sock.sendMessage(chatJid, { text: 'Dihapus.' }); return;
            }
            if (command === '.batal') { sessions[senderJid] = { status: 'IDLE', selectedNumbers: [], kodeToko: '', plu: '' }; await sock.sendMessage(chatJid, { text: 'Dibatalkan.' }); return; }
            
            if (command === '.history') {
                const h = loadHistory()[chatJid] || []; 
                if(h.length===0) { await sock.sendMessage(chatJid, {text: 'History Kosong'}); return; }
                let t = '[ HISTORY TRANSAKSI ]\n\n'; h.forEach((i,x) => t+=`${x+1}. ${i.number} | ${i.kode} | ${i.plu}\n`); 
                if (t.length > 2000) t = t.substring(0, 2000) + "\n...(Ketik .delhis untuk hapus)";
                await sock.sendMessage(chatJid, { text: t }); return;
            }
            if (command === '.delhis') { 
                const h = loadHistory(); h[chatJid] = []; saveHistory(h); 
                await sock.sendMessage(chatJid, { text: 'History Dihapus' }); return; 
            }
            if (command === '.hadiah') { await sock.sendMessage(chatJid, { text: '🎁 Ini hadiahnya!' }); return; }

            // ==========================================
            // TRANSAKSI NORMAL (.co)
            // ==========================================
            if (command === '.co') {
                if (!isStoreOpen) { await sock.sendMessage(chatJid, { text: 'Toko Tutup' }); return; }
                const db = loadDatabase(); const nums = db[chatJid] || []; 
                if (nums.length === 0) { await sock.sendMessage(chatJid, { text: 'Database Kosong' }); return; }
                
                const hist = loadHistory(); const userHist = hist[chatJid] || []; const usedNumbers = new Set(userHist.map(item => item.number));
                
                let txt = '[ PILIH AKUN ]\n'; 
                nums.forEach((n, i) => { 
                    const status = usedNumbers.has(n) ? 'OFF [X]' : 'ON [V]'; 
                    txt += `${i+1}. ${n} - ${status}\n`; 
                });
                txt += '\n> Ketik nomor urut (Contoh: 1-3)\n> Ketik .batal untuk stop';
                
                userSession.status = 'SELECT_ACCOUNTS';
                await sock.sendMessage(chatJid, { text: txt }); return;
            }

            if (userSession.status === 'SELECT_ACCOUNTS') {
                const db = loadDatabase(); const nums = db[chatJid] || []; 
                const selectedIndices = parseIndices(trimmedBody);
                
                const validNumbers = []; selectedIndices.forEach(idx => { if(nums[idx]) validNumbers.push(nums[idx]); });
                if (validNumbers.length === 0) { await sock.sendMessage(chatJid, { text: 'Error pilihan.' }); return; }
                
                userSession.selectedNumbers = validNumbers; 
                userSession.status = 'INPUT_KODETOKO';
                await sock.sendMessage(chatJid, { text: `[INFO] ${validNumbers.length} Akun Dipilih.\n> Masukkan KODE TOKO (4 digit):` }); return;
            }

            if (userSession.status === 'INPUT_KODETOKO') {
                if(trimmedBody.length!==4) { await sock.sendMessage(chatJid, { text: 'Kode harus 4 digit' }); return; }
                userSession.kodeToko = trimmedBody; 
                userSession.status = 'INPUT_PLU';
                await sock.sendMessage(chatJid, { text: `[INFO] Kode: ${trimmedBody}\n> Masukkan PLU:QTY\n> (Contoh: 12345678:3 atau\n> 12345678:3,87654321:2):` }); return;
            }

            if (userSession.status === 'INPUT_PLU') {
                userSession.plu = trimmedBody; 
                userSession.status = 'SELECT_FORMAT';
                await sock.sendMessage(chatJid, { text: `[INFO] Data Siap.\n\nPILIH METODE BAYAR:\n1. BCA\n2. PAYMENT POINT\n\n> Ketik angkanya (1/2):` }); return;
            }

            if (userSession.status === 'SELECT_FORMAT') {
                let fmt = ''; if(trimmedBody==='1') fmt='gas.klik'; else if(trimmedBody==='2') fmt='gas.pp'; else { await sock.sendMessage(chatJid, {text:'1 atau 2'}); return; }
                const sup = NOMOR_SUPPLIER+'@s.whatsapp.net';
                const parsedPlu = userSession.plu.replace(/:/g, 'v').replace(/,/g, 'v');
                
                const fin = loadFinance(); if (!fin[chatJid]) fin[chatJid] = { balance: 0, buy: 0, sell: 0, sold: 0, omzet: 0, profit: 0 };
                
                const loadingMsg = await sock.sendMessage(chatJid, { text: '⏳ [ ░░░░░░░░░░ ] 0% - Memulai...' });
                const frames = ['⌛ [ ███░░░░░░░ ] 30% - Mengirim Data...', '⏳ [ ██████░░░░ ] 60% - Menghubungi Supplier...', '⌛ [ █████████░ ] 90% - Menunggu Respon...'];
                for (const frame of frames) { await new Promise(r => setTimeout(r, 800)); await sock.sendMessage(chatJid, { text: frame, edit: loadingMsg.key }); }

                for(const num of userSession.selectedNumbers) {
                    await sock.sendMessage(sup, { text: `${fmt}.${userSession.kodeToko}v${num}v${parsedPlu}.1` });
                    addHistory(chatJid, num, userSession.kodeToko, userSession.plu); 
                    pendingTransactions[num] = { jid: chatJid, time: Date.now() };
                    gateOpenUntil = Date.now() + 180000; lastUser = chatJid;
                    
                    // 👇 RECORD FINANCE
                    if(fin[chatJid].sell > 0) { 
                        fin[chatJid].sold++; 
                        fin[chatJid].omzet += fin[chatJid].sell; 
                        fin[chatJid].profit += (fin[chatJid].sell - fin[chatJid].buy); 
                        fin[chatJid].balance += fin[chatJid].sell; 
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
                saveFinance(fin);
                
                await sock.sendMessage(chatJid, { text: `✅ [ ██████████ ] 100%\n- ${userSession.selectedNumbers.length} TRANSAKSI TERKIRIM!`, edit: loadingMsg.key });
                sessions[senderJid] = { status: 'IDLE' }; return;
            }

            // ==========================================
            // TRANSAKSI PIN (.pin)
            // ==========================================
            if (command === '.pin') {
                if (!isStoreOpen) { await sock.sendMessage(chatJid, { text: 'Toko Tutup' }); return; }
                const db = loadDatabase(); const nums = db[chatJid] || []; 
                if (nums.length === 0) { await sock.sendMessage(chatJid, { text: 'Database Kosong' }); return; }
                
                const hist = loadHistory(); const userHist = hist[chatJid] || []; const usedNumbers = new Set(userHist.map(item => item.number));
                let txt = '[ PILIH AKUN PIN ]\n'; 
                nums.forEach((n, i) => { const status = usedNumbers.has(n) ? 'OFF [X]' : 'ON [V]'; txt += `${i+1}. ${n} - ${status}\n`; });
                txt += '\n> Ketik nomor urut (Contoh: 1-3)\n> Ketik .batal untuk stop';
                
                userSession.status = 'SELECT_ACCOUNTS_PIN';
                await sock.sendMessage(chatJid, { text: txt }); return;
            }
            if (userSession.status === 'SELECT_ACCOUNTS_PIN') {
                const db = loadDatabase(); const nums = db[chatJid] || []; 
                const selectedIndices = parseIndices(trimmedBody);
                const validNumbers = []; selectedIndices.forEach(idx => { if(nums[idx]) validNumbers.push(nums[idx]); });
                if (validNumbers.length === 0) { await sock.sendMessage(chatJid, { text: '[ERROR] Salah pilih.' }); return; }
                
                const fin = loadFinance(); if (!fin[chatJid]) fin[chatJid] = { balance: 0, buy: 0, sell: 0, sold: 0, omzet: 0, profit: 0 };
                const loadingMsg = await sock.sendMessage(chatJid, { text: '⏳ [ ░░░░░░░░░░ ] 0% - Memulai...' });
                const frames = ['⌛ [ ███░░░░░░░ ] 30% - Mengirim Data...', '⏳ [ ██████░░░░ ] 60% - Menghubungi Supplier...', '⌛ [ █████████░ ] 90% - Menunggu Respon...'];
                for (const frame of frames) { await new Promise(r => setTimeout(r, 800)); await sock.sendMessage(chatJid, { text: frame, edit: loadingMsg.key }); }

                for(const num of validNumbers) {
                    await sock.sendMessage(NOMOR_SUPPLIER+'@s.whatsapp.net', { text: `gas.pin.${num}.1` });
                    addHistory(chatJid, num, 'PIN', '-');
                    pendingTransactions[num] = { jid: chatJid, time: Date.now() };
                    gateOpenUntil = Date.now() + 180000; lastUser = chatJid;
                    
                    // 👇 RECORD FINANCE
                    if(fin[chatJid].sell > 0) { 
                        fin[chatJid].sold++; 
                        fin[chatJid].omzet += fin[chatJid].sell; 
                        fin[chatJid].profit += (fin[chatJid].sell - fin[chatJid].buy); 
                        fin[chatJid].balance += fin[chatJid].sell; 
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
                saveFinance(fin);
                await sock.sendMessage(chatJid, { text: `✅ [ ██████████ ] 100%\n- ${validNumbers.length} TRANSAKSI PIN TERKIRIM!`, edit: loadingMsg.key });
                sessions[senderJid] = { status: 'IDLE' }; return;
            }

        } catch (err) {
            console.error("Error Handler:", err);
        }
    });
}

startBot();
