function loadAdminComplaints() {
  const tbody = document.getElementById("admin-complaints-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-text">Loading…</td></tr>`;
  }

  const status = document.getElementById("admin-filter-status").value;
  const category = document.getElementById("admin-filter-category").value;
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (category) params.set("category", category);

  apiFetch(`/api/complaints?${params.toString()}`)
    .then((rows) => {
      tbody.innerHTML = "";

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No complaints found.</td></tr>`;
        return;
      }

      rows.forEach((c) => {
        const tr = document.createElement("tr");
        tr.dataset.id = c.id; // ⭐ store id safely

        tr.innerHTML = `
          <td>${c.id}</td>
          <td>${c.category}</td>
          <td>${c.user_name || "-"}</td>
          <td>
            <span class="status-tag ${mapStatusToClass(c.status)}">
              ${c.status}
            </span>
          </td>
          <td>${c.location_text || ""}</td>
          <td>${c.assigned_to || ""}</td>
          <td>
            <div class="inline-actions">
              <button class="action-btn action-pending" data-status="Pending">Pending</button>
              <button class="action-btn action-progress" data-status="In Progress">In Progress</button>
              <button class="action-btn action-resolved" data-status="Resolved">Resolve</button>
            </div>
          </td>
        `;

        tr.querySelectorAll(".action-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = tr.dataset.id; // ⭐ get id from DOM
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
              .catch((err) => console.error(err));
          });
        });

        tr.addEventListener("click", () => openAdminComplaint(c.id));

        tbody.appendChild(tr);
      });
    })
    .catch((err) => console.error(err));
}
