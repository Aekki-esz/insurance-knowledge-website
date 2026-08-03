"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* ==================================================
     1. เมนูสำหรับหน้าจอมือถือ
  ================================================== */

  const menuToggle = document.getElementById("menuToggle");
  const mainMenu = document.getElementById("mainMenu");

  if (menuToggle && mainMenu) {
    const closeMenu = () => {
      mainMenu.classList.remove("active");
      menuToggle.classList.remove("active");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "เปิดเมนู");
    };

    menuToggle.addEventListener("click", () => {
      const isOpen = mainMenu.classList.toggle("active");

      menuToggle.classList.toggle("active", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "ปิดเมนู" : "เปิดเมนู");
    });

    mainMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });
  }

  /* ==================================================
     2. คำถามที่พบบ่อย FAQ
  ================================================== */

  document.querySelectorAll(".faq-question").forEach((button) => {
    button.addEventListener("click", () => {
      const faqItem = button.closest(".faq-item");
      const faqList = faqItem?.parentElement;
      const isOpen = faqItem?.classList.contains("active");

      if (!faqItem || !faqList) {
        return;
      }

      faqList.querySelectorAll(".faq-item").forEach((item) => {
        item.classList.remove("active");

        const question = item.querySelector(".faq-question");

        if (question) {
          question.setAttribute("aria-expanded", "false");

          const symbol = question.querySelector("span");

          if (symbol) {
            symbol.textContent = "+";
          }
        }
      });

      if (!isOpen) {
        faqItem.classList.add("active");
        button.setAttribute("aria-expanded", "true");

        const symbol = button.querySelector("span");

        if (symbol) {
          symbol.textContent = "−";
        }
      }
    });
  });

  /* ==================================================
     3. แสดงข้อความ ALT เมื่อยังไม่มีไฟล์ภาพ
  ================================================== */

  document.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      if (img.dataset.fallbackApplied === "true") {
        return;
      }

      img.dataset.fallbackApplied = "true";

      const placeholder = document.createElement("div");

      placeholder.className = "image-fallback";
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute("aria-label", img.alt || "พื้นที่สำหรับรูปภาพ");

      placeholder.textContent =
        img.alt || "ใส่รูปภาพที่เกี่ยวข้องกับเนื้อหาส่วนนี้";

      img.replaceWith(placeholder);
    });
  });

  /* ==================================================
     4. แบบฟอร์มติดต่อและบันทึกข้อมูลลูกค้า
  ================================================== */

  const contactForm = document.querySelector("[data-contact-form]");

  if (!contactForm) {
    return;
  }

  /* --------------------------------------------------
     4.1 อ้างอิงองค์ประกอบในแบบฟอร์ม
  -------------------------------------------------- */

  const status = contactForm.querySelector(".form-status");

  const submitButton = contactForm.querySelector('button[type="submit"]');

  const contactChannelSelect = contactForm.querySelector("#contactChannel");

  const emailContactGroup = contactForm.querySelector("#emailContactGroup");

  const lineContactGroup = contactForm.querySelector("#lineContactGroup");

  const emailInput = contactForm.querySelector("#email");

  const lineIdInput = contactForm.querySelector("#lineId");

  const preferredTimeInput = contactForm.querySelector("#preferredTime");

  const contactChannelHint = contactForm.querySelector("#contactChannelHint");

  /* --------------------------------------------------
     4.2 ฟังก์ชันแสดงสถานะ
  -------------------------------------------------- */

  const showStatus = (message, type = "") => {
    if (!status) {
      return;
    }

    status.textContent = message;
    status.className = type ? `form-status ${type}` : "form-status";
  };

  /* --------------------------------------------------
     4.3 ล้างสถานะช่องกรอกผิด
  -------------------------------------------------- */

  const clearInvalidState = (field) => {
    field.setAttribute("aria-invalid", "false");
  };

  contactForm.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      clearInvalidState(field);
    });

    field.addEventListener("change", () => {
      clearInvalidState(field);
    });
  });

  /* --------------------------------------------------
     4.4 แสดงช่อง LINE หรืออีเมลตามที่ลูกค้าเลือก
  -------------------------------------------------- */

  const updateContactFields = () => {
    const selectedChannel = contactChannelSelect?.value || "";

    const usePhone = selectedChannel === "phone";
    const useEmail = selectedChannel === "email";
    const useLine = selectedChannel === "line";

    if (emailContactGroup) {
      emailContactGroup.hidden = !useEmail;
      emailContactGroup.setAttribute("aria-hidden", String(!useEmail));
    }

    if (lineContactGroup) {
      lineContactGroup.hidden = !useLine;
      lineContactGroup.setAttribute("aria-hidden", String(!useLine));
    }

    if (emailInput) {
      emailInput.required = useEmail;

      if (!useEmail) {
        emailInput.value = "";
        emailInput.setAttribute("aria-invalid", "false");
      }
    }

    if (lineIdInput) {
      lineIdInput.required = useLine;

      if (!useLine) {
        lineIdInput.value = "";
        lineIdInput.setAttribute("aria-invalid", "false");
      }
    }

    if (!contactChannelHint) {
      return;
    }

    if (usePhone) {
      contactChannelHint.textContent =
        "ผู้ให้คำปรึกษาจะติดต่อกลับทางเบอร์โทรศัพท์ที่กรอกไว้";
    } else if (useEmail) {
      contactChannelHint.textContent =
        "กรุณากรอกอีเมลที่สามารถใช้รับข้อมูลและการติดต่อกลับได้";
    } else if (useLine) {
      contactChannelHint.textContent =
        "กรุณากรอก LINE ID ที่สามารถค้นหาและเพิ่มเพื่อนได้";
    } else {
      contactChannelHint.textContent =
        "กรุณาเลือกช่องทางที่สะดวกให้ผู้ให้คำปรึกษาติดต่อกลับ";
    }
  };

  contactChannelSelect?.addEventListener("change", updateContactFields);

  updateContactFields();

  /* --------------------------------------------------
     4.5 ไม่ให้เลือกวันและเวลาย้อนหลัง
  -------------------------------------------------- */

  const setMinimumPreferredTime = () => {
    if (!preferredTimeInput) {
      return;
    }

    const now = new Date();

    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

    preferredTimeInput.min = now.toISOString().slice(0, 16);
  };

  setMinimumPreferredTime();

  /* --------------------------------------------------
     4.6 อัปเดตฟอร์มหลัง Reset
  -------------------------------------------------- */

  contactForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      updateContactFields();
      setMinimumPreferredTime();
    }, 0);
  });

  /* ==================================================
     5. ส่งข้อมูลไป Backend
  ================================================== */

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    showStatus("");

    /* ------------------------------------------------
       5.1 ตรวจช่องที่กำหนด required
    ------------------------------------------------ */

    const requiredFields = [...contactForm.querySelectorAll("[required]")];

    let firstInvalid = null;

    requiredFields.forEach((field) => {
      let invalid = false;

      if (field.type === "checkbox") {
        invalid = !field.checked;
      } else {
        invalid = !String(field.value || "").trim();
      }

      field.setAttribute("aria-invalid", String(invalid));

      if (invalid && !firstInvalid) {
        firstInvalid = field;
      }
    });

    /* ------------------------------------------------
       5.2 ตรวจช่องทางติดต่อกลับ
    ------------------------------------------------ */

    const contactChannel = String(
      contactForm.elements.contactChannel?.value || "",
    ).trim();

    const email = String(contactForm.elements.email?.value || "").trim();

    const lineId = String(contactForm.elements.lineId?.value || "").trim();

    if (contactChannel === "email" && !email) {
      if (emailInput) {
        emailInput.setAttribute("aria-invalid", "true");

        firstInvalid = emailInput;
      }

      showStatus(
        "กรุณากรอกอีเมล เนื่องจากเลือกอีเมลเป็นช่องทางติดต่อกลับ",
        "error",
      );
    } else if (contactChannel === "line" && !lineId) {
      if (lineIdInput) {
        lineIdInput.setAttribute("aria-invalid", "true");

        firstInvalid = lineIdInput;
      }

      showStatus(
        "กรุณากรอก LINE ID เนื่องจากเลือก LINE เป็นช่องทางติดต่อกลับ",
        "error",
      );
    }

    /* ------------------------------------------------
       5.3 ตรวจวันและเวลานัดหมาย
    ------------------------------------------------ */

    const preferredTime = String(
      contactForm.elements.preferredTime?.value || "",
    ).trim();

    if (preferredTime) {
      const selectedDate = new Date(preferredTime);
      const currentDate = new Date();

      if (
        Number.isNaN(selectedDate.getTime()) ||
        selectedDate.getTime() < currentDate.getTime()
      ) {
        if (preferredTimeInput) {
          preferredTimeInput.setAttribute("aria-invalid", "true");

          firstInvalid = preferredTimeInput;
        }

        showStatus("กรุณาเลือกวันและเวลาที่เป็นปัจจุบันหรืออนาคต", "error");
      }
    }

    if (firstInvalid) {
      if (!status?.textContent) {
        showStatus("กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนส่งแบบฟอร์ม", "error");
      }

      firstInvalid.focus();
      return;
    }

    /* ------------------------------------------------
       5.4 สร้างข้อมูลสำหรับส่งไป Backend
    ------------------------------------------------ */

    const formData = new FormData(contactForm);

    const payload = {
      fullName: String(formData.get("fullname") || "").trim(),

      phone: String(formData.get("phone") || "").trim(),

      email: String(formData.get("email") || "").trim(),

      lineId: String(formData.get("lineId") || "").trim(),

      insuranceType: String(formData.get("insuranceType") || "").trim(),

      contactChannel: String(formData.get("contactChannel") || "").trim(),

      preferredTime: String(formData.get("preferredTime") || "").trim(),

      message: String(formData.get("message") || "").trim(),

      website: String(formData.get("website") || "").trim(),

      consent: contactForm.elements.consent?.checked === true,

      sourcePage: window.location.pathname,
    };

    /* ------------------------------------------------
       5.5 ปิดปุ่ม ป้องกันการกดซ้ำ
    ------------------------------------------------ */

    if (submitButton) {
      submitButton.disabled = true;

      submitButton.dataset.originalText = submitButton.textContent;

      submitButton.textContent = "กำลังส่งข้อมูล...";
    }

    showStatus("กำลังบันทึกข้อมูล กรุณารอสักครู่", "loading");

    /* ------------------------------------------------
       5.6 ส่งข้อมูลไป /api/leads
    ------------------------------------------------ */

    try {
      const apiUrl = contactForm.getAttribute("action") || "/api/leads";

      const response = await fetch(apiUrl, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({
        ok: false,
        message: "เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่ถูกต้อง",
      }));

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            `ไม่สามารถส่งข้อมูลได้ รหัสข้อผิดพลาด ${response.status}`,
        );
      }

      /* ------------------------------------------------
         5.7 ส่งข้อมูลสำเร็จ
      ------------------------------------------------ */

      contactForm.reset();

      contactForm.querySelectorAll("[aria-invalid]").forEach((field) => {
        field.setAttribute("aria-invalid", "false");
      });

      const reference = result.reference
        ? ` เลขอ้างอิง ${result.reference}`
        : "";

      showStatus(
        `${
          result.message || "ส่งข้อมูลเรียบร้อยแล้ว ผู้ให้คำปรึกษาจะติดต่อกลับ"
        }${reference}`,
        "success",
      );
    } catch (error) {
      /* ------------------------------------------------
         5.8 ส่งข้อมูลไม่สำเร็จ
      ------------------------------------------------ */

      console.error("ส่งข้อมูลลูกค้าไม่สำเร็จ:", error);

      showStatus(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง",
        "error",
      );
    } finally {
      /* ------------------------------------------------
         5.9 เปิดปุ่มกลับมา
      ------------------------------------------------ */

      if (submitButton) {
        submitButton.disabled = false;

        submitButton.textContent =
          submitButton.dataset.originalText || "ส่งข้อมูลขอรับคำปรึกษา";
      }
    }
  });
});
