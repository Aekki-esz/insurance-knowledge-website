"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) {
  console.error("กรุณาคัดลอก .env.example เป็น .env และกำหนด ADMIN_PASSWORD ก่อนเปิดใช้งาน");
  process.exit(1);
}

const dbFile = path.resolve(ROOT, process.env.DB_PATH || "./data/leads.db");
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    line_id TEXT NOT NULL DEFAULT '',
    insurance_type TEXT NOT NULL,
    contact_channel TEXT NOT NULL,
    preferred_time TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    admin_note TEXT NOT NULL DEFAULT '',
    consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
    consent_at TEXT NOT NULL,
    source_page TEXT NOT NULL DEFAULT '/'
  );
  CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
`);

const insuranceTypes = new Set(["child", "health", "critical", "pa", "life", "retirement", "other"]);
const contactChannels = new Set(["phone", "line", "email"]);
const leadStatuses = new Set(["new", "contacted", "appointment", "closed"]);
const insuranceLabels = {
  child: "ประกันสำหรับลูก",
  health: "ประกันสุขภาพ",
  critical: "ประกันโรคร้ายแรง",
  pa: "ประกันอุบัติเหตุ PA",
  life: "ประกันชีวิต",
  retirement: "วางแผนเกษียณ",
  other: "เรื่องอื่น ๆ"
};
const channelLabels = { phone: "โทรศัพท์", line: "LINE", email: "อีเมล" };
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const rateStore = new Map();
function tooManySubmissions(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const limit = 8;
  const current = rateStore.get(ip) || [];
  const recent = current.filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    rateStore.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateStore.set(ip, recent);
  return false;
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"
  );
}

function send(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  securityHeaders(res);
  res.writeHead(status, { "Content-Type": contentType, ...extraHeaders });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAdmin(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) {
    securityHeaders(res);
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Insurance Admin", charset="UTF-8"' });
    res.end("ต้องเข้าสู่ระบบผู้ดูแล");
    return false;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  } catch {
    send(res, 401, "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
    return false;
  }

  const separator = decoded.indexOf(":");
  const username = separator >= 0 ? decoded.slice(0, separator) : decoded;
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";
  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    securityHeaders(res);
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Insurance Admin", charset="UTF-8"' });
    res.end("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    return false;
  }
  return true;
}

function text(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseJsonBody(req, maxBytes = 30 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("ข้อมูลมีขนาดใหญ่เกินไป"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("รูปแบบข้อมูลไม่ถูกต้อง"));
      }
    });
    req.on("error", reject);
  });
}

function validateLead(body) {
  const lead = {
    fullName: text(body.fullName || body.fullname, 120),
    phone: text(body.phone, 30),
    email: text(body.email, 160).toLowerCase(),
    lineId: text(body.lineId, 100),
    insuranceType: text(body.insuranceType, 30),
    contactChannel: text(body.contactChannel, 30),
    preferredTime: text(body.preferredTime, 100),
    message: text(body.message, 2000),
    consent: body.consent === true || body.consent === "true" || body.consent === "on" || body.consent === 1,
    website: text(body.website, 100),
    sourcePage: text(body.sourcePage, 300) || "/"
  };

  const errors = [];
  if (lead.website) errors.push("ไม่สามารถส่งแบบฟอร์มได้");
  if (lead.fullName.length < 2) errors.push("กรุณากรอกชื่อ–นามสกุล");
  if (!/^[0-9+()\-\s]{8,30}$/.test(lead.phone)) errors.push("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง");
  if (!insuranceTypes.has(lead.insuranceType)) errors.push("กรุณาเลือกเรื่องที่สนใจ");
  if (!contactChannels.has(lead.contactChannel)) errors.push("กรุณาเลือกช่องทางติดต่อกลับ");
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push("รูปแบบอีเมลไม่ถูกต้อง");
  if (lead.contactChannel === "email" && !lead.email) errors.push("กรุณากรอกอีเมลสำหรับติดต่อกลับ");
  if (lead.contactChannel === "line" && !lead.lineId) errors.push("กรุณากรอก LINE ID สำหรับติดต่อกลับ");
  if (!lead.consent) errors.push("กรุณายินยอมให้ติดต่อกลับและจัดเก็บข้อมูลตามวัตถุประสงค์");
  return { lead, errors };
}

async function notifyWebhook(savedLead) {
  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (!webhook) return;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "new_insurance_lead",
      lead: savedLead,
      labels: {
        insurance: insuranceLabels[savedLead.insurance_type] || savedLead.insurance_type,
        contactChannel: channelLabels[savedLead.contact_channel] || savedLead.contact_channel
      }
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Webhook ตอบกลับ ${response.status}`);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function resolveStaticFile(urlPath) {
  const rootPages = new Set(["/index.html", "/articles.html", "/privacy.html", "/terms.html"]);
  if (urlPath === "/") return path.join(ROOT, "index.html");
  if (rootPages.has(urlPath)) return path.join(ROOT, urlPath.slice(1));

  const allowedPrefixes = ["/css/", "/js/", "/images/", "/products/", "/articles/"];
  if (!allowedPrefixes.some((prefix) => urlPath.startsWith(prefix))) return null;

  const decoded = decodeURIComponent(urlPath);
  const file = path.resolve(ROOT, `.${decoded}`);
  if (!file.startsWith(`${ROOT}${path.sep}`)) return null;
  return file;
}

function serveFile(res, filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "ไม่พบหน้าที่ต้องการ");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  securityHeaders(res);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": [".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(ext) ? "public, max-age=86400" : "no-cache"
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleRequest(req, res) {
  const base = `http://${req.headers.host || "localhost"}`;
  const url = new URL(req.url, base);
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/leads") {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    if (tooManySubmissions(ip)) return json(res, 429, { ok: false, message: "ส่งข้อมูลบ่อยเกินไป กรุณาลองใหม่ภายหลัง" });

    let body;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, message: error.message });
    }

    const { lead, errors } = validateLead(body);
    if (errors.length) return json(res, 400, { ok: false, message: errors[0], errors });

    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO leads (
        created_at, full_name, phone, email, line_id, insurance_type,
        contact_channel, preferred_time, message, status, admin_note,
        consent, consent_at, source_page
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', '', 1, ?, ?)
    `).run(
      now, lead.fullName, lead.phone, lead.email, lead.lineId, lead.insuranceType,
      lead.contactChannel, lead.preferredTime, lead.message, now, lead.sourcePage
    );
    const savedLead = db.prepare("SELECT * FROM leads WHERE id = ?").get(info.lastInsertRowid);
    notifyWebhook(savedLead).catch((error) => console.error("ส่ง Webhook ไม่สำเร็จ:", error.message));
    return json(res, 201, {
      ok: true,
      message: "ส่งข้อมูลเรียบร้อยแล้ว ผู้ให้คำปรึกษาจะติดต่อกลับตามช่องทางที่เลือก",
      reference: `LEAD-${savedLead.id}`
    });
  }

  if (pathname.startsWith("/api/admin/") || pathname === "/admin" || pathname === "/admin.css" || pathname === "/admin.js") {
    if (!isAdmin(req, res)) return;
  }

  if (req.method === "GET" && pathname === "/api/admin/leads") {
    const status = text(url.searchParams.get("status"), 30);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 1000);
    const rows = status && leadStatuses.has(status)
      ? db.prepare("SELECT * FROM leads WHERE status = ? ORDER BY datetime(created_at) DESC LIMIT ?").all(status, limit)
      : db.prepare("SELECT * FROM leads ORDER BY datetime(created_at) DESC LIMIT ?").all(limit);
    const counts = db.prepare("SELECT status, COUNT(*) AS count FROM leads GROUP BY status").all();
    return json(res, 200, { ok: true, leads: rows, counts });
  }

  const leadMatch = pathname.match(/^\/api\/admin\/leads\/(\d+)$/);
  if (leadMatch && req.method === "PATCH") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, message: error.message });
    }
    const id = Number(leadMatch[1]);
    const status = text(body.status, 30);
    const adminNote = text(body.adminNote, 2000);
    if (!leadStatuses.has(status)) return json(res, 400, { ok: false, message: "สถานะไม่ถูกต้อง" });
    const result = db.prepare("UPDATE leads SET status = ?, admin_note = ? WHERE id = ?").run(status, adminNote, id);
    if (!result.changes) return json(res, 404, { ok: false, message: "ไม่พบข้อมูลลูกค้า" });
    return json(res, 200, { ok: true, message: "บันทึกข้อมูลแล้ว" });
  }

  if (leadMatch && req.method === "DELETE") {
    const id = Number(leadMatch[1]);
    const result = db.prepare("DELETE FROM leads WHERE id = ?").run(id);
    if (!result.changes) return json(res, 404, { ok: false, message: "ไม่พบข้อมูลลูกค้า" });
    return json(res, 200, { ok: true, message: "ลบข้อมูลแล้ว" });
  }

  if (req.method === "GET" && pathname === "/api/admin/leads.csv") {
    const rows = db.prepare("SELECT * FROM leads ORDER BY datetime(created_at) DESC").all();
    const headers = ["ID", "วันที่", "ชื่อ", "โทรศัพท์", "อีเมล", "LINE ID", "เรื่องที่สนใจ", "ช่องทางติดต่อ", "เวลาที่สะดวก", "รายละเอียด", "สถานะ", "บันทึกผู้ดูแล"];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of rows) {
      lines.push([
        row.id, row.created_at, row.full_name, row.phone, row.email, row.line_id,
        insuranceLabels[row.insurance_type] || row.insurance_type,
        channelLabels[row.contact_channel] || row.contact_channel,
        row.preferred_time, row.message, row.status, row.admin_note
      ].map(csvCell).join(","));
    }
    return send(
      res,
      200,
      `\uFEFF${lines.join("\r\n")}`,
      "text/csv; charset=utf-8",
      { "Content-Disposition": `attachment; filename="insurance-leads-${new Date().toISOString().slice(0, 10)}.csv"` }
    );
  }

  if (req.method === "GET" && pathname === "/admin") return serveFile(res, path.join(ROOT, "private", "admin.html"));
  if (req.method === "GET" && pathname === "/admin.css") return serveFile(res, path.join(ROOT, "private", "admin.css"));
  if (req.method === "GET" && pathname === "/admin.js") return serveFile(res, path.join(ROOT, "private", "admin.js"));

  if (req.method === "GET" || req.method === "HEAD") return serveFile(res, resolveStaticFile(pathname));
  send(res, 405, "Method Not Allowed");
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) json(res, 500, { ok: false, message: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง" });
    else res.end();
  });
});

server.listen(PORT, () => {
  console.log(`เว็บไซต์ทำงานที่ http://localhost:${PORT}`);
  console.log(`หน้าผู้ดูแล: http://localhost:${PORT}/admin`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
