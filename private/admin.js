"use strict";

const state = { leads: [] };
const labels = {
  insurance: {
    child: "ประกันสำหรับลูก",
    health: "ประกันสุขภาพ",
    critical: "ประกันโรคร้ายแรง",
    pa: "ประกันอุบัติเหตุ PA",
    life: "ประกันชีวิต",
    retirement: "วางแผนเกษียณ",
    other: "เรื่องอื่น ๆ"
  },
  channel: { phone: "โทรศัพท์", line: "LINE", email: "อีเมล" }
};

const leadList = document.getElementById("leadList");
const template = document.getElementById("leadTemplate");
const pageStatus = document.getElementById("pageStatus");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function setText(root, selector, value, fallback = "-") {
  const element = root.querySelector(selector);
  if (element) element.textContent = value || fallback;
}

function filteredLeads() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  return state.leads.filter((lead) => {
    if (status && lead.status !== status) return false;
    if (!query) return true;
    return [
      lead.full_name, lead.phone, lead.email, lead.line_id, lead.message,
      labels.insurance[lead.insurance_type], labels.channel[lead.contact_channel]
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function render() {
  leadList.replaceChildren();
  const leads = filteredLeads();
  if (!leads.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "ยังไม่มีข้อมูลที่ตรงกับตัวกรอง";
    leadList.append(empty);
    return;
  }

  for (const lead of leads) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".lead-card");
    setText(card, ".lead-id", `LEAD-${lead.id}`);
    setText(card, ".lead-name", lead.full_name);
    setText(card, ".lead-date", formatDate(lead.created_at));
    setText(card, ".lead-line", lead.line_id);
    setText(card, ".lead-interest", labels.insurance[lead.insurance_type] || lead.insurance_type);
    setText(card, ".lead-channel", labels.channel[lead.contact_channel] || lead.contact_channel);
    setText(card, ".lead-time", lead.preferred_time);
    setText(card, ".lead-message", lead.message);

    const phone = card.querySelector(".lead-phone");
    phone.textContent = lead.phone;
    phone.href = `tel:${lead.phone.replace(/[^0-9+]/g, "")}`;

    const email = card.querySelector(".lead-email");
    email.textContent = lead.email || "-";
    if (lead.email) email.href = `mailto:${lead.email}`;
    else email.removeAttribute("href");

    const status = card.querySelector(".lead-status");
    const note = card.querySelector(".lead-note");
    const saveStatus = card.querySelector(".save-status");
    status.value = lead.status;
    note.value = lead.admin_note || "";

    card.querySelector(".save-button").addEventListener("click", async () => {
      saveStatus.textContent = "กำลังบันทึก...";
      try {
        const response = await fetch(`/api/admin/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: status.value, adminNote: note.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "บันทึกไม่สำเร็จ");
        lead.status = status.value;
        lead.admin_note = note.value;
        saveStatus.textContent = "บันทึกแล้ว";
        updateCounts();
      } catch (error) {
        saveStatus.textContent = error.message;
      }
    });

    card.querySelector(".delete-button").addEventListener("click", async () => {
      if (!window.confirm(`ลบข้อมูลของ ${lead.full_name} ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้`)) return;
      try {
        const response = await fetch(`/api/admin/leads/${lead.id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "ลบไม่สำเร็จ");
        state.leads = state.leads.filter((item) => item.id !== lead.id);
        updateCounts();
        render();
      } catch (error) {
        saveStatus.textContent = error.message;
      }
    });

    leadList.append(node);
  }
}

function updateCounts(countRows) {
  const counts = { new: 0, contacted: 0, appointment: 0, closed: 0 };
  if (Array.isArray(countRows)) {
    countRows.forEach((row) => { if (row.status in counts) counts[row.status] = row.count; });
  } else {
    state.leads.forEach((lead) => { if (lead.status in counts) counts[lead.status] += 1; });
  }
  document.getElementById("countNew").textContent = counts.new;
  document.getElementById("countContacted").textContent = counts.contacted;
  document.getElementById("countAppointment").textContent = counts.appointment;
  document.getElementById("countClosed").textContent = counts.closed;
}

async function loadLeads() {
  pageStatus.textContent = "กำลังโหลดข้อมูล...";
  try {
    const response = await fetch("/api/admin/leads");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "โหลดข้อมูลไม่สำเร็จ");
    state.leads = result.leads;
    updateCounts(result.counts);
    render();
    pageStatus.textContent = `พบ ${state.leads.length} รายการ`;
  } catch (error) {
    pageStatus.textContent = error.message;
  }
}

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
document.getElementById("refreshButton").addEventListener("click", loadLeads);
loadLeads();
