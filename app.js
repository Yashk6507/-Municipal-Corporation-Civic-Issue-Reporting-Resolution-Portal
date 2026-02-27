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
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${c.id ?? ""}</td>
          <td>${c.category ?? ""}</td>
          <td>${c.status ?? ""}</td>
          <td>${c.location_text ?? ""}</td>
          <td>${c.assigned_to ?? ""}</td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error(err);
      tbody.innerHTML =
        `<tr><td colspan="6">Error loading complaints</td></tr>`;
    });
}
