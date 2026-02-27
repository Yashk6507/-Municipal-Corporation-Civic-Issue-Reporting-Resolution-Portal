function loadAdminComplaints() {
  const tbody = document.getElementById("admin-complaints-body");
  if (!tbody) return;

  tbody.innerHTML =
    `<tr><td colspan="6" class="loading-text">Loading…</td></tr>`;

  apiFetch("/api/complaints")
    .then((rows) => {
      console.log("Admin complaints:", rows);

      if (!Array.isArray(rows)) {
        tbody.innerHTML =
          `<tr><td colspan="6">Failed to load complaints</td></tr>`;
        return;
      }

      tbody.innerHTML = "";

      rows.forEach((c) => {
        const id = c.id ?? c._id ?? c.complaint_id;
        if (!id) return; // prevents crash

        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${id}</td>
          <td>${c.category ?? ""}</td>
          <td>${c.status ?? ""}</td>
          <td>${c.location_text ?? ""}</td>
          <td>${c.assigned_to ?? ""}</td>
          <td>
            <button class="update-btn" data-id="${id}" data-status="Pending">Pending</button>
            <button class="update-btn" data-id="${id}" data-status="In Progress">In Progress</button>
            <button class="update-btn" data-id="${id}" data-status="Resolved">Resolve</button>
          </td>
        `;

        tbody.appendChild(tr);
      });

      // attach listeners AFTER rendering
      document.querySelectorAll(".update-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const status = btn.dataset.status;

          apiFetch(`/api/complaints/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          })
            .then(() => {
              showToast(`Updated to ${status}`);
              loadAdminComplaints();
              loadAdminStats();
            })
            .catch((err) => console.error(err));
        });
      });
    })
    .catch((err) => {
      console.error(err);
      tbody.innerHTML =
        `<tr><td colspan="6">Error loading complaints</td></tr>`;
    });
}
