// app.js
const API_BASE = window.APP_CONFIG.API_BASE;

const studentsTableBody = document.querySelector("#students-table tbody");

const uploadModal = document.getElementById("upload-modal");
const modalCloseBtn = document.getElementById("modal-close");
const modalInfo = document.getElementById("modal-student-info");

const formUpload = document.getElementById("form-upload");
const uploadStudentIdInput = document.getElementById("upload-student-id");
const uploadPasswordInput = document.getElementById("upload-password");
const uploadTaskInput = document.getElementById("upload-task");
const uploadLinkInput = document.getElementById("upload-link");
const uploadMsg = document.getElementById("upload-message");
const uploadHistoryDiv = document.getElementById("upload-history");

// cache student (biar gak fetch /students lagi pas klik upload)
let studentsCache = [];

function showMessage(el, text, type = "success") {
  el.textContent = text;
  el.classList.remove("success", "error");
  el.classList.add(type);
}

async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

async function renderStudentsTable() {
  try {
    const res = await fetch(`${API_BASE}/students/with-counts`);
    if (!res.ok) throw new Error("Failed to fetch students");
    const students = await res.json();

    studentsCache = Array.isArray(students) ? students : [];

    if (!studentsCache.length) {
      studentsTableBody.innerHTML = `
        <tr><td colspan="4" class="empty">Belum ada mahasiswa terdaftar.</td></tr>`;
      return;
    }

    studentsTableBody.innerHTML = "";

    for (const s of studentsCache) {
      const tr = document.createElement("tr");
      tr.dataset.id = s._id;

      tr.innerHTML = `
        <td>${escapeHtml(s.nama)}</td>
        <td>${escapeHtml(s.nim)}</td>
        <td>${Number(s.totalTugas || 0)}</td>
        <td>
          <div class="table-actions">
            <a 
              href="tasks.html?studentId=${encodeURIComponent(s._id)}" 
              target="_blank" 
              rel="noopener noreferrer"
              class="link-view"
            >
              Lihat Tugas
            </a>
            <button 
              type="button" 
              class="btn btn-small btn-upload" 
              data-id="${s._id}"
            >
              Upload
            </button>
          </div>
        </td>
      `;
      studentsTableBody.appendChild(tr);
    }
  } catch (err) {
    console.error("Gagal load mahasiswa:", err);
    studentsTableBody.innerHTML = `
      <tr><td colspan="4" class="empty">Gagal memuat data (cek backend).</td></tr>`;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// klik upload → modal
studentsTableBody.addEventListener("click", async (e) => {
  const uploadBtn = e.target.closest(".btn-upload");
  if (!uploadBtn) return;

  const studentId = uploadBtn.dataset.id;
  const student = studentsCache.find((s) => s._id === studentId);
  if (!student) return;

  uploadStudentIdInput.value = studentId;
  modalInfo.textContent = `${student.nama} (NIM ${student.nim})`;

  uploadPasswordInput.value = "";
  uploadTaskInput.value = "";
  uploadLinkInput.value = "";
  uploadMsg.textContent = "";
  uploadMsg.classList.remove("success", "error");

  await renderUploadHistory(studentId);

  uploadModal.classList.add("show");
});

// close modal
modalCloseBtn.addEventListener("click", () => uploadModal.classList.remove("show"));
uploadModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) uploadModal.classList.remove("show");
});

async function renderUploadHistory(studentId) {
  try {
    const res = await fetch(`${API_BASE}/submissions/${studentId}/history`);
    if (!res.ok) throw new Error("Failed history");
    const subs = await res.json();

    if (!subs.length) {
      uploadHistoryDiv.innerHTML = `<p class="hint">Belum ada link tugas yang disimpan.</p>`;
      return;
    }

    let html = `<h4>Riwayat Tugas:</h4><ul>`;

    subs.forEach((sub) => {
      html += `
        <li>
          <div>
            <strong>${escapeHtml(sub.taskName)}</strong><br>
            <span style="opacity:.7">${new Date(sub.uploadedAt).toLocaleString()}</span><br>
            <a href="${escapeHtml(sub.link)}" target="_blank" rel="noopener noreferrer" style="color:#93c5fd">
              Buka Link Tugas
            </a>
          </div>
          <button 
            type="button" 
            class="btn btn-xsmall btn-delete-task"
            data-sub-id="${sub._id}"
            data-student-id="${studentId}"
          >
            Hapus
          </button>
        </li>
      `;
    });

    html += `</ul>`;
    uploadHistoryDiv.innerHTML = html;
  } catch (err) {
    console.error(err);
    uploadHistoryDiv.innerHTML = `<p class="hint">Gagal memuat riwayat.</p>`;
  }
}

// delete dari modal history
uploadHistoryDiv.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-delete-task");
  if (!btn) return;

  const studentId = btn.dataset.studentId;
  const submissionId = btn.dataset.subId;
  const password = uploadPasswordInput.value.trim();

  if (!password) {
    showMessage(uploadMsg, "Isi sandi dulu sebelum menghapus tugas.", "error");
    return;
  }

  const ok = window.confirm("Yakin ingin menghapus tugas ini?");
  if (!ok) return;

  try {
    const res = await fetch(`${API_BASE}/submissions/${studentId}/${submissionId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = (await safeJson(res)) || {};
    if (!res.ok || data.status === "error") {
      showMessage(uploadMsg, data.message || "Gagal menghapus tugas.", "error");
      return;
    }

    showMessage(uploadMsg, data.message || "Tugas dihapus.", "success");
    await renderUploadHistory(studentId);
    await renderStudentsTable();
  } catch (err) {
    console.error(err);
    showMessage(uploadMsg, "Gagal menghapus tugas (network error).", "error");
  }
});

// upload link
formUpload.addEventListener("submit", async (e) => {
  e.preventDefault();

  const studentId = uploadStudentIdInput.value;
  const password = uploadPasswordInput.value.trim();
  const taskName = uploadTaskInput.value.trim();
  const link = uploadLinkInput.value.trim();

  if (!studentId || !password || !taskName || !link) {
    showMessage(uploadMsg, "Semua field wajib diisi.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/submissions/${studentId}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, taskName, link })
    });

    const data = (await safeJson(res)) || {};
    if (!res.ok || data.status === "error") {
      showMessage(uploadMsg, data.message || "Gagal menyimpan link.", "error");
      return;
    }

    showMessage(uploadMsg, data.message || "Link tersimpan.", "success");
    await renderUploadHistory(studentId);
    await renderStudentsTable();
  } catch (err) {
    console.error(err);
    showMessage(uploadMsg, "Terjadi kesalahan jaringan.", "error");
  }
});

// init
renderStudentsTable();
