function loadAdminComplaints() {
  const tbody = document.getElementById("admin-complaints-body");
  if (!tbody) return;

  tbody.innerHTML =
    `<tr><td colspan="7" class="loading-text">Loading…</td></tr>`;

  const statusEl = document.getElementById("admin-filter-status");
  const categoryEl = document.getElementById("admin-filter-category");

  const status = statusEl ? statusEl.value : "";
  const category = categoryEl ? categoryEl.value : "";

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (category) params.set("category", category);

  apiFetch(`/api/complaints?${params.toString()}`)
    .then((rows) => {
      if (!Array.isArray(rows)) {
        console.error("Invalid complaints response:", rows);
        tbody.innerHTML =
          `<tr><td colspan="7" class="empty-state">Failed to load data</td></tr>`;
        return;
      }

      tbody.innerHTML = "";

      if (rows.length === 0) {
        tbody.innerHTML =
          `<tr><td colspan="7" class="empty-state">No complaints found.</td></tr>`;
        return;
      }

      rows.forEach((c) => {
        const id = c.id ?? c._id ?? c.complaint_id;
        if (!id) return;

        const tr = document.createElement("tr");
        tr.dataset.id = id;

        tr.innerHTML = `
          <td>${id}</td>
          <td>${c.category || ""}</td>
          <td>${c.status || ""}</td>
          <td>${c.location_text || ""}</td>
          <td>${c.assigned_to || ""}</td>
          <td>
            <button class="action-btn" data-status="Pending">Pending</button>
            <button class="action-btn" data-status="In Progress">In Progress</button>
            <button class="action-btn" data-status="Resolved">Resolve</button>
          </td>
        `;

        tr.querySelectorAll(".action-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const newStatus = btn.dataset.status;

            apiFetch(`/api/complaints/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: newStatus }),
            })
              .then(() => {
                loadAdminComplaints();
                loadAdminStats();
                showToast(`Marked ${newStatus}`);
              })
              .catch(console.error);
          });
        });

        tbody.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error(err);
      tbody.innerHTML =
        `<tr><td colspan="7" class="empty-state">Error loading complaints</td></tr>`;
    });
}
