
      const API_BASE = "http://localhost:5000";
      const MM_TO_PX = 3.7795275591;

      const CONFIG = {
        maxLevels: 6,
        baseGap: 140,
        levelGap: 120,
        extraGapPerLevelMm: 0.1,
        amountByLevel: [100,120,150,180,220,260],
        adminRole: "Enterprise Admin",
        unlockMode: "Full-level completion"
      };

      const state = {
        members: [],
        admin: {
          name: "Aditya Reddy",
          email: "aditya.reddy@enterprise.example",
          phone: "+1-202-555-0142"
        },
        accountLinks: [],
        view: "desktop",
        page: 1,
        pageSize: 12,
        selectedId: null,
        syncing: false,
        filters: {
          query: "",
          payment: "all",
          reach: "all",
          level: "all"
        },
        paymentFilters: {
          level: "all",
          status: "all",
          date: ""
        }
      };

      const subscribers = [];
      function subscribe(listener){
        subscribers.push(listener);
        return () => {
          const idx = subscribers.indexOf(listener);
          if (idx >= 0) subscribers.splice(idx, 1);
        };
      }
      function notify(){
        for (const fn of subscribers) fn(state);
      }
      function setState(patch){
        Object.assign(state, patch);
        notify();
      }
      function updateMembers(updater){
        state.members = updater(state.members);
        notify();
      }
function updatePaymentStatus(userId, status){
        const normalized = status === "Completed" || status === "Not Completed" || status === "Overdue" ? status : "Not Completed";
        updateMembers(members => members.map(m => {
          if (m.id !== userId) return m;
          const paidAmount = normalized === "Completed" ? CONFIG.amountByLevel[m.level] : 0;
          return { ...m, paymentStatus: normalized, paidAmount };
        }));
      }

      function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}}
      let rand = mulberry32(1337);

      const FIRST_NAMES = ["Aditya","Aarav","Anika","Dev","Isha","Kabir","Maya","Nina","Rohan","Sanya","Tara","Veer","Yash","Zara","Riya","Kiran","Neel","Ovi","Pari","Arjun"];
      const LAST_NAMES = ["Reddy","Patel","Singh","Sharma","Iyer","Khan","Das","Mehta","Gupta","Nair","Kapoor","Bhat","Kulkarni","Joshi","Verma","Rao","Shetty","Malhotra"];

      function generateName(idx){
        const first = FIRST_NAMES[idx % FIRST_NAMES.length];
        const last = LAST_NAMES[(idx * 7) % LAST_NAMES.length];
        return `${first} ${last}`;
      }

      function buildBinaryMembers(levels){
        const total = (1 << levels) - 1;
        const members = Array.from({ length: total }, (_, idx) => {
          const level = Math.floor(Math.log2(idx + 1));
          const id = idx + 1;
          const parentId = idx === 0 ? null : Math.floor((idx - 1) / 2) + 1;
          const joinedAt = new Date(Date.now() - id * 86400000).toISOString().split("T")[0];
          const paymentCompleted = idx === 0 ? true : rand() > 0.58;
          const overdue = !paymentCompleted && (id % 9 === 0);

          return {
            id,
            parentId,
            level,
            name: idx === 0 ? "Aditya Reddy" : generateName(idx),
            email: `member${id}@enterprise.example`,
            phone: `+1-202-555-${String(1000 + (id % 900)).slice(-4)}`,
            joinedAt,
            status: id % 6 === 0 ? "Inactive" : "Active",
            paymentStatus: paymentCompleted ? "Completed" : (overdue ? "Overdue" : "Not Completed"),
            paidAmount: paymentCompleted ? CONFIG.amountByLevel[level] : 0,
            parentIds: parentId ? [parentId] : [],
            childrenIds: [],
            agreementAccepted: true
          };
        });

        for (const m of members) {
          const leftId = m.id * 2;
          const rightId = m.id * 2 + 1;
          if (leftId <= total) m.childrenIds.push(leftId);
          if (rightId <= total) m.childrenIds.push(rightId);
        }

        return members;
      }

      const api = {
        async syncPayments(){
          state.syncing = true;
          notify();
          let synced = 0;
          await Promise.all(state.members.map(async (m) => {
            try {
              const res = await fetch(`${API_BASE}/payment/${m.id}`);
              if (!res.ok) return;
              const data = await res.json();
              if (!data || !data.status) return;
              const normalized = data.status === "paid" ? "Completed" : "Not Completed";
              updatePaymentStatus(m.id === 1 ? 1 : m.id, m.id === 1 ? "Completed" : normalized);
              synced++;
            } catch {
            }
          }));
          state.syncing = false;
          notify();
          return synced;
        },
        async markPaymentCompleted(id){
          updatePaymentStatus(id, "Completed");
          return true;
        },
        async reversePayment(id){
          updatePaymentStatus(id, "Not Completed");
          return true;
        },
        async createMember(payload){
          updateMembers(members => {
            const nextId = members.length + 1;
            const level = payload.parentId ? Math.floor(Math.log2(payload.parentId)) + 1 : 0;
            const newMember = {
              id: nextId,
              parentId: payload.parentId || null,
              level,
              name: payload.name,
              email: payload.email,
              phone: payload.phone,
              joinedAt: payload.joinedAt,
              status: "Active",
              paymentStatus: "Not Completed",
              paidAmount: 0,
              parentIds: payload.parentId ? [payload.parentId] : [],
              childrenIds: [],
              agreementAccepted: true
            };

            const updated = [...members, newMember];
            const parent = updated.find(m => m.id === payload.parentId);
            if (parent && parent.childrenIds.length < 2) {
              parent.childrenIds.push(nextId);
            }
            return updated;
          });
          return true;
        },
        async saveAdminProfile(profile){
          state.admin = { ...state.admin, ...profile };
          notify();
          return true;
        },
        async linkAccount(link){
          state.accountLinks.push(link);
          notify();
          return true;
        }
      };

      function ancestorChain(member){
        const chain = [];
        let current = member;
        while (current && current.parentId != null) {
          const parent = state.members.find(m => m.id === current.parentId);
          if (!parent) break;
          chain.push(parent);
          current = parent;
        }
        return chain;
      }

      function levelUnlocked(level){
        if (level === 0) return true;
        const previousLevels = state.members.filter(m => m.level < level);
        return previousLevels.every(m => m.paymentStatus === "Completed");
      }

      function isReachable(member){
        if (!levelUnlocked(member.level)) return false;
        if (member.id === 1) return true;
        const chain = ancestorChain(member);
        return chain.every(m => m.paymentStatus === "Completed");
      }

      function paymentClass(member){
        if (!isReachable(member)) return "locked";
        const status = member.paymentStatus;
        if (status === "Completed") return "paid";
        if (status === "Overdue") return "overdue";
        return "unpaid";
      }

      function matchesFilters(member){
        const query = state.filters.query.trim().toLowerCase();
        const paymentFilter = state.filters.payment;
        const reachFilter = state.filters.reach;
        const levelFilter = state.filters.level;

        const reach = isReachable(member);
        const reachOk =
          reachFilter === "all" ||
          (reachFilter === "reachable" && reach) ||
          (reachFilter === "locked" && !reach);

        const paymentOk = paymentFilter === "all" || member.paymentStatus === paymentFilter;
        const levelOk = levelFilter === "all" || member.level === Number(levelFilter);

        const queryOk =
          !query ||
          member.name.toLowerCase().includes(query) ||
          member.email.toLowerCase().includes(query) ||
          member.phone.toLowerCase().includes(query) ||
          String(member.id).includes(query);

        return reachOk && paymentOk && levelOk && queryOk;
      }

      function updateStats(){
        const total = state.members.length;
        const paid = state.members.filter(m => m.paymentStatus === "Completed").length;
        const locked = state.members.filter(m => !isReachable(m)).length;
        const depth = Math.max(...state.members.map(m => m.level));

        statTotal.textContent = total;
        statPaid.textContent = paid;
        statLocked.textContent = locked;
        statDepth.textContent = depth;
        profileMembers.textContent = `${total} members`;
        pillMembers.textContent = `${total}`;
      }

      function populateLevelFilters(){
        const max = Math.max(...state.members.map(m => m.level));
        fLevel.innerHTML = '<option value="all">All</option>';
        pLevel.innerHTML = '<option value="all">All</option>';
        for (let lvl = 0; lvl <= max; lvl++) {
          const opt = document.createElement("option");
          opt.value = String(lvl);
          opt.textContent = `Level ${lvl}`;
          fLevel.appendChild(opt.cloneNode(true));
          pLevel.appendChild(opt);
        }
      }

      function layoutTree(treeEl, svgEl, wrapEl){
        treeEl.innerHTML = "";
        svgEl.innerHTML = "";

        const nodesByLevel = new Map();
        for (const m of state.members) {
          if (!nodesByLevel.has(m.level)) nodesByLevel.set(m.level, []);
          nodesByLevel.get(m.level).push(m);
        }

        const levels = Array.from(nodesByLevel.keys()).sort((a,b) => a-b);
        const maxLevel = levels.length ? Math.max(...levels) : 0;
        const nodeWidth = 86;
        const nodeHeight = 70;
        const extraGapPx = CONFIG.extraGapPerLevelMm * MM_TO_PX;

        const levelHeights = maxLevel + 1;
        const height = Math.max(640, 80 + (levelHeights - 1) * CONFIG.levelGap + nodeHeight);

        let width = 980;
        const levelLayouts = new Map();
        for (const level of levels) {
          const items = nodesByLevel.get(level).sort((a,b) => a.id - b.id);
          const gap = CONFIG.baseGap + level * extraGapPx;
          const levelWidth = (items.length - 1) * gap + nodeWidth;
          levelLayouts.set(level, { items, gap, levelWidth });
          width = Math.max(width, levelWidth + 80);
        }

        wrapEl.style.minWidth = `${width}px`;
        wrapEl.style.minHeight = `${height}px`;

        const positions = new Map();
        for (const level of levels) {
          const { items, gap, levelWidth } = levelLayouts.get(level);
          const startX = (width - levelWidth) / 2 + nodeWidth / 2;
          const y = 50 + level * CONFIG.levelGap;
          items.forEach((member, index) => {
            const x = startX + index * gap;
            positions.set(member.id, { x, y });
          });
        }

        for (const member of state.members) {
          if (member.parentId == null) continue;
          const a = positions.get(member.parentId);
          const b = positions.get(member.id);
          if (!a || !b) continue;

          const visible = isReachable(member);
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", a.x);
          line.setAttribute("y1", a.y);
          line.setAttribute("x2", b.x);
          line.setAttribute("y2", b.y);
          line.setAttribute("stroke", visible ? "rgba(10,40,25,.35)" : "rgba(154,167,160,.30)");
          line.setAttribute("stroke-width", visible ? "2" : "1.4");
          line.setAttribute("stroke-linecap", "round");
          svgEl.appendChild(line);
        }

        const filteredIds = new Set(state.members.filter(matchesFilters).map(m => m.id));
        for (const member of state.members) {
          const pos = positions.get(member.id);
          if (!pos) continue;

          const el = document.createElement("button");
          el.type = "button";
          el.className = `node ${paymentClass(member)}${state.selectedId === member.id ? " selected" : ""}`;
          el.style.left = `${pos.x - nodeWidth / 2}px`;
          el.style.top = `${pos.y - nodeHeight / 2}px`;
          el.dataset.id = String(member.id);

          const reach = isReachable(member);
          const canInteract = reach || member.id === 1;

          const matches = filteredIds.has(member.id);
          if (!matches) {
            el.style.opacity = "0.40";
          }

          el.disabled = !canInteract && member.id !== 1;
          el.setAttribute("aria-label", `${member.name}, ${member.paymentStatus}, level ${member.level}${reach ? "" : ", locked"}`);

          el.innerHTML = `
            <div class="nodeTitle">${member.id === 1 ? "HEAD" : ("M" + member.id)}</div>
            <div class="nodeSub">L${member.level}</div>
            <span class="cornerTag">${reach ? member.paymentStatus : "Locked"}</span>
          `;

          el.addEventListener("click", () => {
            openNodeDetailsPopup(member.id);
          });

          treeEl.appendChild(el);
        }

        centerTree(wrapEl, width, height);
      }

      function centerTree(wrapEl, width, height){
        const area = wrapEl.parentElement;
        if (!area) return;
        window.requestAnimationFrame(() => {
          const x = Math.max(0, (width - area.clientWidth) / 2);
          const y = Math.max(0, (height - area.clientHeight) / 2);
          area.scrollLeft = x;
          area.scrollTop = y;
        });
      }

      function chipHtml(member){
        const reach = isReachable(member);
        const reachChip = reach
          ? `<span class="chip"><span class="dot" style="background:var(--paid)"></span>Reachable</span>`
          : `<span class="chip locked"><span class="dot"></span>Locked</span>`;

        const p = reach ? member.paymentStatus : "Locked";
        const cls = reach ? paymentClass(member) : "locked";
        const payChip = `<span class="chip ${cls}"><span class="dot"></span>${p}</span>`;

        return { reachChip, payChip };
      }

      function renderDirectory(){
        rows.innerHTML = "";

        const filtered = state.members.filter(matchesFilters);
        dirCount.textContent = `${filtered.length} shown`;

        const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
        state.page = Math.max(1, Math.min(state.page, totalPages));

        const start = (state.page - 1) * state.pageSize;
        const pageItems = filtered.slice(start, start + state.pageSize);

        for (const member of pageItems) {
          const { reachChip, payChip } = chipHtml(member);

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>
              <div style="font-weight:900">${member.name}</div>
              <div class="small">${member.email}</div>
            </td>
            <td>Level ${member.level}</td>
            <td>${payChip}</td>
            <td>${reachChip}</td>
            <td>${member.joinedAt}</td>
          `;
          tr.addEventListener("click", () => openNodeDetailsPopup(member.id));
          rows.appendChild(tr);
        }

        pageInfo.textContent = `Page ${state.page} of ${Math.max(1, totalPages)}`;
        btnPrev.disabled = state.page === 1;
        btnNext.disabled = state.page === totalPages;
      }

      function renderMembersView(){
        const total = state.members.length;
        const active = state.members.filter(m => m.status === "Active").length;
        const inactive = total - active;
        const levels = Math.max(...state.members.map(m => m.level)) + 1;

        membersTotal.textContent = total;
        membersActive.textContent = active;
        membersInactive.textContent = inactive;
        membersLevels.textContent = levels;

        const levelMap = new Map();
        for (const m of state.members) {
          levelMap.set(m.level, (levelMap.get(m.level) || 0) + 1);
        }
        levelCounts.innerHTML = "";
        Array.from(levelMap.entries()).sort((a,b)=>a[0]-b[0]).forEach(([level,count]) => {
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `<div style="font-weight:800">Level ${level}</div><div class="listRowMeta">${count} members</div>`;
          row.addEventListener("click", () => {
            state.filters.level = String(level);
            fLevel.value = String(level);
            setState({ view: "desktop" });
            openNodeDetailsPopup(state.members.find(m => m.level === level)?.id || 1);
          });
          levelCounts.appendChild(row);
        });

        memberList.innerHTML = "";
        state.members.forEach((member) => {
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `
            <div style="font-weight:800">${member.name}</div>
            <div class="listRowMeta">ID ${member.id} - Level ${member.level} - ${member.paymentStatus}</div>
          `;
          row.addEventListener("click", () => {
            highlightNode(member.id);
            openNodeDetailsPopup(member.id);
          });
          memberList.appendChild(row);
        });
      }

      function filterPayments(member){
        const levelOk = state.paymentFilters.level === "all" || member.level === Number(state.paymentFilters.level);
        const statusOk = state.paymentFilters.status === "all" || member.paymentStatus === state.paymentFilters.status;
        const dateOk = !state.paymentFilters.date || member.joinedAt === state.paymentFilters.date;
        return levelOk && statusOk && dateOk;
      }

      function renderPaymentsView(){
        const completed = state.members.filter(m => m.paymentStatus === "Completed" && filterPayments(m));
        const pending = state.members.filter(m => m.paymentStatus !== "Completed" && filterPayments(m));

        paymentsSummary.textContent = `${pending.length} pending`;
        pillPayments.textContent = `${pending.length}`;

        paymentsCompleted.innerHTML = "";
        completed.forEach(member => {
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `
            <div style="font-weight:800">${member.name}</div>
            <div class="listRowMeta">ID ${member.id} - Level ${member.level} - Paid ${member.paidAmount}</div>
          `;
          row.addEventListener("click", () => openNodeDetailsPopup(member.id));
          paymentsCompleted.appendChild(row);
        });

        paymentsPending.innerHTML = "";
        pending.forEach(member => {
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `
            <div style="font-weight:800">${member.name}</div>
            <div class="listRowMeta">ID ${member.id} • Level ${member.level} • ${member.paymentStatus}</div>
            <div class="btnRow" style="margin-top:6px">
              <button class="btn btnPrimary" data-action="complete" data-id="${member.id}">Mark Completed</button>
              <button class="btn btnDanger" data-action="reverse" data-id="${member.id}">Reverse</button>
            </div>
          `;
          row.querySelectorAll("button").forEach(btn => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const id = Number(btn.dataset.id);
if (btn.dataset.action === "complete") await markPaymentCompleted(id);
              if (btn.dataset.action === "reverse") await reversePayment(id);
            });
          });
          row.addEventListener("click", () => openNodeDetailsPopup(member.id));
          paymentsPending.appendChild(row);
        });
      }

      function renderCompilation(){
        const totalRevenue = state.members.reduce((sum,m)=>sum + m.paidAmount,0);
        const completed = state.members.filter(m => m.paymentStatus === "Completed").length;
        const completionPct = state.members.length ? Math.round((completed / state.members.length) * 100) : 0;
        const active = state.members.filter(m => m.status === "Active").length;
        const inactive = state.members.length - active;
        const depth = Math.max(...state.members.map(m => m.level));

        compRevenue.textContent = `$${totalRevenue.toLocaleString()}`;
        compCompletion.textContent = `${completionPct}%`;
        compActive.textContent = `${active} / ${inactive}`;
        compDepth.textContent = depth;

        const levelRevenueMap = new Map();
        for (const m of state.members) {
          levelRevenueMap.set(m.level, (levelRevenueMap.get(m.level) || 0) + m.paidAmount);
        }
        levelRevenue.innerHTML = "";
        Array.from(levelRevenueMap.entries()).sort((a,b)=>a[0]-b[0]).forEach(([level, revenue]) => {
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `<div style="font-weight:800">Level ${level}</div><div class="listRowMeta">$${revenue.toLocaleString()} revenue</div>`;
          levelRevenue.appendChild(row);
        });

        depthAnalysis.innerHTML = "";
        const levelCounts = new Map();
        for (const m of state.members) {
          levelCounts.set(m.level, (levelCounts.get(m.level) || 0) + 1);
        }
        Array.from(levelCounts.entries()).sort((a,b)=>a[0]-b[0]).forEach(([level, count]) => {
          const unlocked = levelUnlocked(level) ? "Unlocked" : "Locked";
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `<div style="font-weight:800">Level ${level}</div><div class="listRowMeta">${count} members - ${unlocked}</div>`;
          depthAnalysis.appendChild(row);
        });
      }

      function renderSettings(){
        adminName.value = state.admin.name;
        adminEmail.value = state.admin.email;
        adminPhone.value = state.admin.phone;

        cfgAmount.value = CONFIG.amountByLevel.map((v,i)=>`L${i}:$${v}`).join(" | ");
        cfgLevels.value = String(CONFIG.maxLevels);
        cfgUnlock.value = CONFIG.unlockMode;

        rolePermissions.innerHTML = "";
        const roles = [
          { role: "Enterprise Admin", permissions: ["Execute payments", "Override locks", "Edit profiles", "Export data"] },
          { role: "Auditor", permissions: ["Read-only", "Export reports"] },
          { role: "Support", permissions: ["View members", "Mark payment"] }
        ];
        roles.forEach(r => {
          const row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML = `<div style="font-weight:800">${r.role}</div><div class="listRowMeta">${r.permissions.join(", ")}</div>`;
          rolePermissions.appendChild(row);
        });
      }

      function toastMsg(msg){
        toast.textContent = msg;
        toast.classList.add("show");
        window.setTimeout(() => toast.classList.remove("show"), 2200);
      }

      let modalTimer = null;
      function openNodeDetailsPopup(memberId){
        const member = state.members.find(m => m.id === memberId);
        if (!member) return;
        state.selectedId = memberId;

        const reach = isReachable(member);
        const lockedNote = reach ? "Reachable" : "Locked by unpaid ancestor or locked level";

        mTitle.textContent = member.name;
        mSub.textContent = `ID ${member.id} - Level ${member.level} - ${lockedNote}`;

        mBody.innerHTML = `
          <div class="kv"><div class="k">Email</div><div class="v">${member.email}</div></div>
          <div class="kv"><div class="k">Mobile</div><div class="v">${member.phone}</div></div>
          <div class="kv"><div class="k">Joined Date</div><div class="v">${member.joinedAt}</div></div>
          <div class="kv"><div class="k">Total Amount Paid</div><div class="v">$${member.paidAmount}</div></div>
          <div class="kv"><div class="k">Payment Status</div><div class="v">${member.paymentStatus}</div></div>
          <div class="kv"><div class="k">Parent ID</div><div class="v">${member.parentId ?? "-"}</div></div>
        `;

        mTerms.checked = member.agreementAccepted === true;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        mClose.focus();

        if (modalTimer) window.clearTimeout(modalTimer);
        modalTimer = window.setTimeout(closeModal, 60000);

        highlightNode(member.id);
      }

      function closeModal(){
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        state.selectedId = null;
        if (modalTimer) window.clearTimeout(modalTimer);
        highlightNode(null);
      }

      function highlightNode(id){
        state.selectedId = id;
        renderTrees();
      }
      async function markPaymentCompleted(id){
        await api.markPaymentCompleted(id);
        toastMsg("Payment marked completed.");
      }

      async function reversePayment(id){
        await api.reversePayment(id);
        toastMsg("Payment reversed.");
      }

      function exportCsv(){
        const cols = ["id","name","email","phone","level","status","paymentStatus","paidAmount","parentId","joinedAt","childrenIds"];
        const lines = [cols.join(",")];
        for (const m of state.members) {
          const row = cols.map(k => {
            const v = m[k] == null ? "" : Array.isArray(m[k]) ? m[k].join("|") : String(m[k]);
            return `"${v.replaceAll('"','""')}"`;
          });
          lines.push(row.join(","));
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "members.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toastMsg("Exported members.csv");
      }

      function renderTrees(){
        layoutTree(tree, connections, treeWrap);
        layoutTree(treeAlt, connectionsAlt, treeWrapAlt);
      }

      function render(){
        updateStats();
        renderDirectory();
        renderMembersView();
        renderPaymentsView();
        renderCompilation();
        renderSettings();
        if (modal.classList.contains("open") && state.selectedId) {          openNodeDetailsPopup(state.selectedId);        }        renderTrees();
        treeStatus.textContent = state.syncing ? "Syncing" : "Synced";
        treeStatusAlt.textContent = treeStatus.textContent;
        profileStatus.textContent = state.syncing ? "Syncing" : "Sync Ready";
      }

      function showView(view){
        state.view = view;
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        const active = document.getElementById(`view-${view}`);
        if (active) active.classList.add("active");
        document.querySelectorAll(".menuBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));

        const titles = {
          "desktop": ["Network Overview", "Professional member directory + binary tree view, with payment gating and audit-friendly details."],
          "membership-tree": ["Membership Tree", "Binary tree view with level-locked payments and admin governance."],
          "members": ["Members", "Full frame member directory with level analytics and direct node access."],
          "payments": ["Payments", "Admin-controlled payments with completions and reversals."],
          "compilation": ["Compilation", "Aggregated system intelligence and revenue analysis."],
          "settings": ["Settings", "Admin profile, account linking, and system configuration."],
        };
        const [title, subtitle] = titles[view] || ["Enterprise Console", ""];
        viewTitle.textContent = title;
        viewSubtitle.textContent = subtitle;

        if (view === "settings") {
          viewActions.style.visibility = "hidden";
        } else {
          viewActions.style.visibility = "visible";
        }

        render();
      }

      function validateMemberPayload(payload){
        if (!payload.name || !payload.email || !payload.phone || !payload.joinedAt) return "All fields are required.";
        const parentId = Number(payload.parentId);
        if (!parentId || !state.members.find(m => m.id === parentId)) return "Parent ID must match an existing member.";
        const parent = state.members.find(m => m.id === parentId);
        if (parent.childrenIds.length >= 2) return "Parent already has two children.";
        return "";
      }

      function openAddModal(){
        addModal.classList.add("open");
        addModal.setAttribute("aria-hidden", "false");
        addName.value = "";
        addEmail.value = "";
        addPhone.value = "";
        addParent.value = "";
        addJoined.value = new Date().toISOString().split("T")[0];
        addName.focus();
      }

      function closeAddModal(){
        addModal.classList.remove("open");
        addModal.setAttribute("aria-hidden", "true");
      }

      async function createMember(){
        const payload = {
          name: addName.value.trim(),
          email: addEmail.value.trim(),
          phone: addPhone.value.trim(),
          parentId: Number(addParent.value.trim()),
          joinedAt: addJoined.value
        };
        const error = validateMemberPayload(payload);
        if (error) {
          toastMsg(error);
          return;
        }
        await api.createMember(payload);
        closeAddModal();
        toastMsg("Member created.");
      }

      async function syncPayments(){
        const synced = await api.syncPayments();
        toastMsg(synced ? `Synced ${synced} payments.` : "Backend not reachable. Local data active.");
      }

      function init(){
        state.members = buildBinaryMembers(CONFIG.maxLevels);
        populateLevelFilters();
        render();
      }

      const tree = document.getElementById("tree");
      const connections = document.getElementById("connections");
      const treeWrap = document.getElementById("treeWrap");
      const treeAlt = document.getElementById("treeAlt");
      const connectionsAlt = document.getElementById("connectionsAlt");
      const treeWrapAlt = document.getElementById("treeWrapAlt");

      const q = document.getElementById("q");
      const fPayment = document.getElementById("fPayment");
      const fReach = document.getElementById("fReach");
      const fLevel = document.getElementById("fLevel");
      const btnReset = document.getElementById("btnReset");

      const rows = document.getElementById("rows");
      const dirCount = document.getElementById("dirCount");
      const pageInfo = document.getElementById("pageInfo");
      const btnPrev = document.getElementById("btnPrev");
      const btnNext = document.getElementById("btnNext");

      const statTotal = document.getElementById("statTotal");
      const statPaid = document.getElementById("statPaid");
      const statLocked = document.getElementById("statLocked");
      const statDepth = document.getElementById("statDepth");

      const profileStatus = document.getElementById("profileStatus");
      const profileMembers = document.getElementById("profileMembers");
      const pillMembers = document.getElementById("pillMembers");
      const pillPayments = document.getElementById("pillPayments");

      const treeStatus = document.getElementById("treeStatus");
      const treeStatusAlt = document.getElementById("treeStatusAlt");

      const membersTotal = document.getElementById("membersTotal");
      const membersActive = document.getElementById("membersActive");
      const membersInactive = document.getElementById("membersInactive");
      const membersLevels = document.getElementById("membersLevels");
      const levelCounts = document.getElementById("levelCounts");
      const memberList = document.getElementById("memberList");

      const paymentsSummary = document.getElementById("paymentsSummary");
      const paymentsCompleted = document.getElementById("paymentsCompleted");
      const paymentsPending = document.getElementById("paymentsPending");
      const pLevel = document.getElementById("pLevel");
      const pStatus = document.getElementById("pStatus");
      const pDate = document.getElementById("pDate");
      const btnPaymentsReset = document.getElementById("btnPaymentsReset");

      const compRevenue = document.getElementById("compRevenue");
      const compCompletion = document.getElementById("compCompletion");
      const compActive = document.getElementById("compActive");
      const compDepth = document.getElementById("compDepth");
      const levelRevenue = document.getElementById("levelRevenue");
      const depthAnalysis = document.getElementById("depthAnalysis");

      const adminName = document.getElementById("adminName");
      const adminEmail = document.getElementById("adminEmail");
      const adminPhone = document.getElementById("adminPhone");
      const btnSaveAdmin = document.getElementById("btnSaveAdmin");
      const linkUserId = document.getElementById("linkUserId");
      const linkExternal = document.getElementById("linkExternal");
      const btnLinkAccount = document.getElementById("btnLinkAccount");
      const cfgAmount = document.getElementById("cfgAmount");
      const cfgLevels = document.getElementById("cfgLevels");
      const cfgUnlock = document.getElementById("cfgUnlock");
      const rolePermissions = document.getElementById("rolePermissions");

      const modal = document.getElementById("modal");
      const mClose = document.getElementById("mClose");
      const mClose2 = document.getElementById("mClose2");
      const mTitle = document.getElementById("mTitle");
      const mSub = document.getElementById("mSub");
      const mBody = document.getElementById("mBody");
      const mTerms = document.getElementById("mTerms");
      const addModal = document.getElementById("addModal");
      const addClose = document.getElementById("addClose");
      const addClose2 = document.getElementById("addClose2");
      const addName = document.getElementById("addName");
      const addEmail = document.getElementById("addEmail");
      const addPhone = document.getElementById("addPhone");
      const addParent = document.getElementById("addParent");
      const addJoined = document.getElementById("addJoined");
      const btnCreateMember = document.getElementById("btnCreateMember");

      const toast = document.getElementById("toast");
      const btnExport = document.getElementById("btnExport");
      const btnAdd = document.getElementById("btnAdd");

      const viewTitle = document.getElementById("viewTitle");
      const viewSubtitle = document.getElementById("viewSubtitle");
      const viewActions = document.getElementById("viewActions");

      const darkToggle = document.getElementById("darkToggle");
      const btnSyncPayments = document.getElementById("btnSyncPayments");

      function applyTheme(mode){
        const isDark = mode === "dark";
        document.body.classList.toggle("dark", isDark);
        if (darkToggle) darkToggle.checked = isDark;
        localStorage.setItem("theme", isDark ? "dark" : "light");
      }
      subscribe(render);
      if (darkToggle) {        const savedTheme = localStorage.getItem("theme") || "light";
applyTheme(savedTheme);
darkToggle.addEventListener("change", () => applyTheme(darkToggle.checked ? "dark" : "light"));
}

      document.querySelectorAll(".menuBtn").forEach(btn => {
        btn.addEventListener("click", () => showView(btn.dataset.view));
      });

      [q, fPayment, fReach, fLevel].forEach(el => {
        el.addEventListener("input", () => {
          state.page = 1;
          state.filters.query = q.value;
          state.filters.payment = fPayment.value;
          state.filters.reach = fReach.value;
          state.filters.level = fLevel.value;
          render();
        });
        el.addEventListener("change", () => {
          state.page = 1;
          state.filters.query = q.value;
          state.filters.payment = fPayment.value;
          state.filters.reach = fReach.value;
          state.filters.level = fLevel.value;
          render();
        });
      });

      btnReset.addEventListener("click", () => {
        q.value = "";
        fPayment.value = "all";
        fReach.value = "all";
        fLevel.value = "all";
        state.page = 1;
        state.filters = { query: "", payment: "all", reach: "all", level: "all" };
        render();
      });

      btnPrev.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); render(); });
      btnNext.addEventListener("click", () => { state.page = state.page + 1; render(); });

      mClose.addEventListener("click", closeModal);
      mClose2.addEventListener("click", closeModal);
      modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) closeModal(); });

      btnExport.addEventListener("click", exportCsv);
      btnAdd.addEventListener("click", openAddModal);
      if (btnSyncPayments) btnSyncPayments.addEventListener("click", syncPayments);

      addClose.addEventListener("click", closeAddModal);
      addClose2.addEventListener("click", closeAddModal);
      addModal.addEventListener("click", (e) => { if (e.target === addModal) closeAddModal(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && addModal.classList.contains("open")) closeAddModal(); });
      btnCreateMember.addEventListener("click", createMember);

      pLevel.addEventListener("change", () => { state.paymentFilters.level = pLevel.value; renderPaymentsView(); });
      pStatus.addEventListener("change", () => { state.paymentFilters.status = pStatus.value; renderPaymentsView(); });
      pDate.addEventListener("change", () => { state.paymentFilters.date = pDate.value; renderPaymentsView(); });
      btnPaymentsReset.addEventListener("click", () => {
        pLevel.value = "all";
        pStatus.value = "all";
        pDate.value = "";
        state.paymentFilters = { level: "all", status: "all", date: "" };
        renderPaymentsView();
      });

      btnSaveAdmin.addEventListener("click", async () => {
        await api.saveAdminProfile({
          name: adminName.value.trim(),
          email: adminEmail.value.trim(),
          phone: adminPhone.value.trim()
        });
        toastMsg("Admin profile updated.");
      });

      btnLinkAccount.addEventListener("click", async () => {
        const userId = linkUserId.value.trim();
        const externalId = linkExternal.value.trim();
        if (!userId || !externalId) {
          toastMsg("Provide both internal and external IDs.");
          return;
        }
        await api.linkAccount({ userId, externalId, linkedAt: new Date().toISOString() });
        toastMsg("Account linked.");
        linkUserId.value = "";
        linkExternal.value = "";
      });

      let resizeT = null;
      window.addEventListener("resize", () => {
        window.clearTimeout(resizeT);
        resizeT = window.setTimeout(renderTrees, 120);
      });

      init();
      showView("desktop");
    