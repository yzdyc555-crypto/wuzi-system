/* 物资采购需求计划管理系统 - 前端逻辑 */
"use strict";

/* ---------------- 工具 ---------------- */
async function api(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opts
    });
    if (res.status === 401) { location.href = "/"; throw new Error("未登录"); }
    const data = await res.json();
    if (!data.ok) throw new Error(data.msg || "请求失败");
    return data;
  } catch (e) {
    if (e.message !== "未登录") toast(e.message || "网络错误", "error");
    throw e;
  }
}

function toast(msg, type = "") {
  let box = document.getElementById("toastBox");
  if (!box) { box = document.createElement("div"); box.id = "toastBox"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 2600);
}

function openModal(html) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-mask" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) { return Number(n || 0).toFixed(2); }

const STATUS_TAG = {
  draft: '<span class="tag tag-draft">草稿</span>',
  pending: '<span class="tag tag-pending">待审批</span>',
  approved: '<span class="tag tag-approved">已通过</span>',
  rejected: '<span class="tag tag-rejected">已退回</span>',
  withdrawn: '<span class="tag tag-withdrawn">已撤回</span>'
};
const ROLE_NAME = { super: "开发者", admin: "高级管理员", approver: "审批人", employee: "普通员工" };

/* ---------------- 全局状态 ---------------- */
let USER = null;

/* ---------------- 导航 ---------------- */
const NAVS = {
  super: [
    { key: "dashboard", label: "工作台", render: renderDashboard },
    { key: "fill", label: "需求填报", render: renderFill },
    { key: "materials", label: "物料库", render: renderMaterials },
    { key: "demandManage", label: "需求单管理", render: renderDemandManage },
    { key: "approve", label: "待办审批", render: renderApprove },
    { key: "approveDone", label: "已办记录", render: renderApproveDone },
    { key: "matRequests", label: "新物料申请", render: renderMatRequests },
    { key: "templates", label: "模板管理", render: renderTemplates },
    { key: "deptReceivers", label: "部门收货配置", render: renderDeptReceivers },
    { key: "users", label: "用户管理", render: renderUsers },
    { key: "logs", label: "操作日志", render: renderLogs }
  ],
  admin: [
    { key: "dashboard", label: "工作台", render: renderDashboard },
    { key: "fill", label: "需求填报", render: renderFill },
    { key: "materials", label: "物料库", render: renderMaterials },
    { key: "demandManage", label: "需求单管理", render: renderDemandManage },
    { key: "approve", label: "待办审批", render: renderApprove },
    { key: "approveDone", label: "已办记录", render: renderApproveDone },
    { key: "matRequests", label: "新物料申请", render: renderMatRequests },
    { key: "templates", label: "模板管理", render: renderTemplates },
    { key: "deptReceivers", label: "部门收货配置", render: renderDeptReceivers },
    { key: "users", label: "用户管理", render: renderUsers }
  ],
  approver: [
    { key: "fill", label: "需求填报", render: renderFill },
    { key: "approve", label: "待办审批", render: renderApprove },
    { key: "approveDone", label: "已办记录", render: renderApproveDone }
  ],
  employee: [
    { key: "fill", label: "新建填报", render: renderFill },
    { key: "myDemands", label: "我的单据", render: renderMyDemands }
  ]
};

let currentNav = null;

function toggleSidebar(open) {
  document.getElementById("sidebar").classList.toggle("open", open);
  document.getElementById("sidebarMask").classList.toggle("show", open);
}

function setActive(key) {
  currentNav = key;
  const navs = NAVS[USER.role];
  const nav = navs.find(n => n.key === key) || navs[0];
  const box = document.getElementById("nav");
  box.innerHTML = navs.map(n => {
    const badge = navBadges[n.key] ? `<span class="nav-badge">${navBadges[n.key]}</span>` : "";
    return `<div class="nav-item ${n.key === nav.key ? "active" : ""}" onclick="setActive('${n.key}')">${n.label}${badge}</div>`;
  }).join("");
  document.getElementById("topbarTitle").textContent = nav.label;
  toggleSidebar(false);
  nav.render();
}

const navBadges = {};
async function refreshBadges() {
  if (!USER || USER.role === "employee" || USER.role === "approver") return;
  try {
    const data = await api("/api/stats");
    navBadges.matRequests = data.stats.pending_material_reqs || 0;
    if (USER.role === "super" || USER.role === "admin") navBadges.approve = data.stats.pending_demands || 0;
    if (currentNav) setActive(currentNav);
  } catch (e) {}
}

/* ---------------- 工作台 ---------------- */
async function renderDashboard() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/stats");
  const s = data.stats;
  let cards = "";
  if (USER.role === "super" || USER.role === "admin") {
    cards = `
      <div class="stat-grid">
        <div class="stat-card" style="cursor:pointer" onclick="setActive('users')"><div class="num">${s.total_users}</div><div class="label">在职账号</div></div>
        <div class="stat-card green" style="cursor:pointer" onclick="setActive('materials')"><div class="num">${s.materials}</div><div class="label">标准物料</div></div>
        <div class="stat-card orange" style="cursor:pointer" onclick="setActive('approve')"><div class="num">${s.pending_demands}</div><div class="label">待审批单据</div></div>
        <div class="stat-card green" style="cursor:pointer" onclick="mgFilter.status='approved';setActive('demandManage')"><div class="num">${s.approved_demands}</div><div class="label">已通过单据</div></div>
        <div class="stat-card red" style="cursor:pointer" onclick="setActive('matRequests')"><div class="num">${s.pending_material_reqs}</div><div class="label">新物料待审核</div></div>
      </div>
      <div class="card">
        <div class="card-title">快捷入口</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button class="btn btn-primary" onclick="setActive('materials')">物料库管理</button>
          <button class="btn" onclick="setActive('demandManage')">需求单管理 / 导出</button>
          <button class="btn" onclick="setActive('matRequests')">新物料申请审核</button>
          ${(USER.role === "super" || USER.role === "admin") ? '<button class="btn" onclick="setActive(\'users\')">用户管理</button>' : ""}
        </div>
        <div class="muted small" style="margin-top:12px">提示：将云梦泽导出的物料数据通过「物料库 → 批量导入」建立标准物料库；员工填报后即可一键导出标准采购计划单。</div>
      </div>`;
  } else {
    cards = `
      <div class="stat-grid">
        <div class="stat-card"><div class="num">${s.drafts}</div><div class="label">草稿</div></div>
        <div class="stat-card orange"><div class="num">${s.pending}</div><div class="label">审批中</div></div>
        <div class="stat-card green"><div class="num">${s.approved}</div><div class="label">已通过</div></div>
        <div class="stat-card red"><div class="num">${s.rejected}</div><div class="label">已退回</div></div>
      </div>`;
  }
  v.innerHTML = cards;
}

/* ---------------- 填报（基层/管理员通用） ---------------- */
let fillState = { id: null, department: "", fill_date: "", reporter: "", rows: [] };
let rowSeq = 0;

function newRow() {
  rowSeq += 1;
  fillState.rows.push({
    _k: "r" + Date.now() + "_" + rowSeq,
    material_code: "", material_name: "", spec: "", unit: "",
    price: 0, quantity: "", amount: 0, ecode: "", supplier_code: "", supplier: ""
  });
}

function rowHtml(r) {
  return `<div class="mat-row" data-k="${r._k}">
    <div class="mat-main mat-name-box">
      <input class="mat-search" placeholder="输入物料名称/编号/型号，自动匹配标准物料" value="${esc(r.material_name)}" autocomplete="off">
      <div class="match-list" style="display:none"></div>
    </div>
    <input class="mat-qty" type="number" min="0" step="any" placeholder="数量(必填)" value="${r.quantity}">
    <input class="mat-unit" placeholder="单位" value="${esc(r.unit)}" title="匹配物料时自动带出，可手动修改" style="width:70px">
    <input class="mat-price" type="number" min="0" step="any" placeholder="单价" value="${r.price || ""}" title="匹配物料时自动带出，可手动修改">
    <div class="mat-amount">${money(r.amount)}</div>
    <button class="mat-del btn btn-sm btn-danger" onclick="delFillRow(this)">删除</button>
  </div>`;
}

function renderFill() {
  const v = document.getElementById("view");
  // 修复：若页面上已有填报表格，先保留每行已填写的数量/单价/单位/物料描述，
  // 避免增删行触发重渲染时把已填内容覆盖清空
  collectFillRowsFromDom();
  // 修复：若页面上已有填报头部输入框，先保留用户已填写的单位/日期/填表人，
  // 避免匹配物料或增删行触发重渲染时把已填内容清空
  const deptEl = document.getElementById("fillDept");
  if (deptEl) {
    fillState.department = deptEl.value.trim();
    fillState.fill_date = document.getElementById("fillDate").value;
    fillState.reporter = document.getElementById("fillReporter").value.trim();
  }
  if (!fillState.rows.length) newRow();
  const rowsHtml = fillState.rows.map(rowHtml).join("");
  v.innerHTML = `
  <div class="card">
    <div class="card-title">物资需求填报 <span class="hint">填写单位/日期/填表人，逐行选择物料（输关键字自动匹配，单位单价自动带出）</span></div>
    <div class="form-grid">
      <div class="form-item"><label>填报单位 <span class="req">*</span></label><input id="fillDept" value="${esc(fillState.department)}" placeholder="必填，如：办公室"></div>
      <div class="form-item"><label>填报日期 <span class="req">*</span></label><input id="fillDate" type="date" value="${esc(fillState.fill_date)}"></div>
      <div class="form-item"><label>填表人 <span class="req">*</span></label><input id="fillReporter" value="${esc(fillState.reporter)}" placeholder="必填，填表人姓名"></div>
    </div>
    <div id="fillRows">${rowsHtml}</div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
      <button class="btn" onclick="addFillRow()">＋ 添加物料行</button>
      <button class="btn" onclick="openNewMaterialReq()">＋ 申请新物料入库</button>
      <span class="spacer"></span>
      <button class="btn" onclick="saveFill('draft')">保存草稿</button>
      <button class="btn btn-primary" onclick="saveFill('submit')">提交审批</button>
    </div>
  </div>`;
  bindRowEvents();
}

function bindRowEvents() {
  document.querySelectorAll(".mat-search").forEach(inp => {
    inp.addEventListener("input", debounce(() => doMatch(inp), 300));
    inp.addEventListener("focus", () => { if (inp.value.trim()) doMatch(inp); });
  });
  document.querySelectorAll(".mat-qty, .mat-price").forEach(inp => {
    inp.addEventListener("input", () => calcRow(inp));
  });
}

function debounce(fn, ms) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function doMatch(inp) {
  const row = inp.closest(".mat-row");
  const kw = inp.value.trim();
  const list = row.querySelector(".match-list");
  if (!kw) { list.style.display = "none"; return; }
  let data;
  try { data = await api("/api/materials?kw=" + encodeURIComponent(kw)); } catch (e) { return; }
  const ms = data.materials;
  if (!ms.length) { list.style.display = "none"; return; }
  list.innerHTML = ms.map(m => `
    <div class="match-item" onclick="pickMaterial(this, '${row.dataset.k}')"
         data-code="${esc(m.code)}" data-name="${esc(m.name)}" data-spec="${esc(m.spec)}"
         data-unit="${esc(m.unit)}" data-price="${m.price}" data-ecode="${esc(m.ecode)}"
         data-sc="${esc(m.supplier_code)}" data-sup="${esc(m.supplier)}">
      <div class="m-name">${esc(m.name)}</div>
      <div class="m-meta">${esc(m.code)} ${esc(m.spec)} ${esc(m.unit)} · 供应商:${esc(m.supplier || "-")} · 单价:<span class="m-price">${money(m.price)}</span></div>
    </div>`).join("");
  list.style.display = "block";
}

function collectFillRowsFromDom() {
  // 将页面上已填写的行内容（数量/单价/单位/物料描述）同步回状态，
  // 保证重渲染时不覆盖用户已填写的内容
  const rowsEls = document.querySelectorAll("#fillRows .mat-row");
  if (!rowsEls.length) return;
  rowsEls.forEach(domRow => {
    const row = fillState.rows.find(r => r._k === domRow.dataset.k);
    if (!row) return;
    const name = domRow.querySelector(".mat-search").value.trim();
    if (name) row.material_name = name;
    const u = domRow.querySelector(".mat-unit").value.trim();
    if (u) row.unit = u;
    const q = parseFloat(domRow.querySelector(".mat-qty").value);
    if (!isNaN(q)) row.quantity = q;
    const p = parseFloat(domRow.querySelector(".mat-price").value);
    if (!isNaN(p)) row.price = p;
  });
}

function pickMaterial(el, k) {
  const row = fillState.rows.find(r => r._k === k);
  if (!row) return;
  row.material_code = el.dataset.code;
  row.material_name = el.dataset.name;
  row.spec = el.dataset.spec;
  row.unit = el.dataset.unit;
  row.price = parseFloat(el.dataset.price) || 0;
  row.ecode = el.dataset.ecode;
  row.supplier_code = el.dataset.sc;
  row.supplier = el.dataset.sup;
  // 修复：只更新当前行，不做整页重渲染，保留该行及顶部已填写的数量/单价/单位/单位日期填表人
  const domRow = document.querySelector(`#fillRows .mat-row[data-k="${k}"]`);
  if (domRow) {
    const nameInp = domRow.querySelector(".mat-search");
    nameInp.value = row.material_name;
    const unitInp = domRow.querySelector(".mat-unit");
    unitInp.value = row.unit;
    const priceInp = domRow.querySelector(".mat-price");
    priceInp.value = row.price || "";
    calcRow(priceInp);
    const list = domRow.querySelector(".match-list");
    if (list) list.style.display = "none";
  }
  toast("已匹配：" + row.material_name);
}

document.addEventListener("click", e => {
  if (!e.target.closest(".mat-main")) {
    document.querySelectorAll(".match-list").forEach(l => l.style.display = "none");
  }
});

function addFillRow() { newRow(); renderFill(); }
function delFillRow(btn) {
  const k = btn.closest(".mat-row").dataset.k;
  fillState.rows = fillState.rows.filter(r => r._k !== k);
  renderFill();
}

function collectFill() {
  fillState.department = document.getElementById("fillDept").value.trim();
  fillState.fill_date = document.getElementById("fillDate").value;
  fillState.reporter = document.getElementById("fillReporter").value.trim();
  if (!fillState.department) { toast("请填写填报单位", "error"); return null; }
  if (!fillState.fill_date) { toast("请选择填报日期", "error"); return null; }
  if (!fillState.reporter) { toast("请填写填表人", "error"); return null; }
  const rows = [];
  document.querySelectorAll("#fillRows .mat-row").forEach(r => {
    const k = r.dataset.k;
    const qty = parseFloat(r.querySelector(".mat-qty").value) || 0;
    const price = parseFloat(r.querySelector(".mat-price").value) || 0;
    const name = r.querySelector(".mat-search").value.trim();
    if (!name) return;
    // 从原状态复用匹配物料时带出的隐藏字段（编号/规格/编码/供应商）
    const prev = fillState.rows.find(x => x._k === k) || {};
    rows.push({
      material_code: prev.material_code || "",
      material_name: name,
      spec: prev.spec || "",
      unit: r.querySelector(".mat-unit").value.trim(),
      price, quantity: qty,
      amount: Math.round(price * qty * 100) / 100,
      ecode: prev.ecode || "", supplier_code: prev.supplier_code || "", supplier: prev.supplier || ""
    });
  });
  if (!rows.length) { toast("请至少填写一行物料（含物料描述与数量）", "error"); return null; }
  for (const r of rows) {
    if (!r.quantity || r.quantity <= 0) { toast("物料「" + r.material_name + "」数量必须大于0", "error"); return null; }
  }
  return rows;
}

function calcRow(inp) {
  const row = inp.closest(".mat-row");
  const qty = parseFloat(row.querySelector(".mat-qty").value) || 0;
  const price = parseFloat(row.querySelector(".mat-price").value) || 0;
  row.querySelector(".mat-amount").textContent = money(Math.round(price * qty * 100) / 100);
}

async function saveFill(mode) {
  const rows = collectFill();
  if (!rows) return;
  const payload = {
    id: fillState.id,
    department: fillState.department,
    fill_date: fillState.fill_date,
    reporter: fillState.reporter,
    items: rows
  };
  const data = await api("/api/demands/save-draft", { method: "POST", body: JSON.stringify(payload) });
  fillState.id = data.id;
  if (mode === "submit") {
    await api(`/api/demands/${data.id}/submit`, { method: "POST" });
    toast("已提交，等待审批", "success");
    resetFill();
    const dest = USER.role === "employee" ? "myDemands" : USER.role === "approver" ? "approve" : "demandManage";
    setActive(dest);
  } else {
    toast("草稿已保存", "success");
  }
}

function resetFill() {
  fillState = { id: null, department: "", fill_date: "", reporter: "", rows: [] };
  rowSeq = 0;
}

async function loadFillDraft(id) {
  const data = await api("/api/demands/" + id);
  const d = data.demand;
  fillState = {
    id: d.id, department: d.department || "",
    fill_date: d.fill_date || "", reporter: d.reporter || "", rows: []
  };
  d.items.forEach(it => {
    fillState.rows.push({
      _k: "r" + Date.now() + "_" + (++rowSeq),
      material_code: it.material_code, material_name: it.material_name,
      spec: it.spec, unit: it.unit, price: it.price, quantity: it.quantity,
      amount: it.amount, ecode: it.ecode, supplier_code: it.supplier_code, supplier: it.supplier
    });
  });
  setActive("fill");
}

/* ---------------- 员工：新物料申请 ---------------- */
function openNewMaterialReq() {
  openModal(`
    <div class="modal-head"><div class="title">申请新物料入库</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="muted small" style="margin-bottom:12px">库内无匹配物料时填写，管理员审核并补全编码、单价等信息后自动纳入标准物料库。</div>
      <div class="form-grid">
        <div class="form-item"><label>物料描述（必填）</label><input id="mrName" placeholder="如：耐油手套 丁腈橡胶"></div>
        <div class="form-item"><label>规格型号</label><input id="mrSpec" placeholder="如：L码 / 100只/盒"></div>
        <div class="form-item"><label>计量单位</label><input id="mrUnit" placeholder="如：双 / 盒 / 箱"></div>
        <div class="form-item" style="grid-column:1/-1"><label>用途说明</label><textarea id="mrRemark" rows="2" placeholder="简要说明用途"></textarea></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitNewMaterialReq()">提交申请</button>
    </div>`);
}

async function submitNewMaterialReq() {
  const name = document.getElementById("mrName").value.trim();
  if (!name) { toast("请填写物料描述", "error"); return; }
  await api("/api/material-requests", { method: "POST", body: JSON.stringify({
    name, spec: document.getElementById("mrSpec").value.trim(),
    unit: document.getElementById("mrUnit").value.trim(),
    remark: document.getElementById("mrRemark").value.trim()
  })});
  closeModal();
  toast("申请已提交，等待管理员审核", "success");
}

/* ---------------- 员工：我的单据 ---------------- */
let myFilter = { status: "" };
async function renderMyDemands() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  let url = "/api/demands";
  if (myFilter.status) url += "?status=" + myFilter.status;
  const data = await api(url);
  const chips = [["", "全部"], ["draft", "草稿"], ["pending", "待审批"], ["approved", "已通过"], ["rejected", "已退回"], ["withdrawn", "已撤回"]]
    .map(([k, label]) => `<button class="chip ${myFilter.status === k ? "active" : ""}" onclick="setMyFilter('${k}')">${label}</button>`).join("");
  if (!data.demands.length) {
    v.innerHTML = `<div class="card"><div class="card-title">我的单据</div><div class="filter-chip">${chips}</div><div class="empty">暂无单据，点击「新建填报」开始</div></div>`;
    return;
  }
  const rows = data.demands.map(d => {
    const canEdit = ["draft", "rejected", "withdrawn"].includes(d.status);
    let ops = "";
    if (canEdit) ops += `<button class="btn btn-sm" onclick="loadFillDraft(${d.id})">编辑</button> `;
    if (d.status === "draft") ops += `<button class="btn btn-sm btn-primary" onclick="submitDemand(${d.id})">提交</button> `;
    if (d.status === "pending") ops += `<button class="btn btn-sm" onclick="withdrawDemand(${d.id})">撤回</button> `;
    ops += `<button class="btn btn-sm" onclick="viewDemand(${d.id})">查看</button> `;
    if (d.status === "approved") ops += `<button class="btn btn-sm" onclick="copyDemand(${d.id})">一键复制</button> `;
    if (d.status === "draft") ops += `<button class="btn btn-sm btn-danger" onclick="deleteDemand(${d.id})">删除</button>`;
    return `<tr>
      <td>${esc(d.order_no)}</td><td>${esc(d.department)}</td><td>${esc(d.reporter || d.user_name)}</td>
      <td class="t-right">${money(d.total)}</td><td>${STATUS_TAG[d.status]}</td>
      <td>${esc(d.submitted_at || d.created_at)}</td>
      <td>${d.status === "rejected" ? '<span class="muted small">' + esc(d.approve_comment) + '</span>' : ""}</td>
      <td>${ops}</td></tr>`;
  }).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">我的单据</div>
    <div class="filter-chip">${chips}</div>
    <div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>单据编号</th><th>部门</th><th>填表人</th><th class="t-right">金额(元)</th><th>状态</th><th>提交时间</th><th>退回原因</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

function setMyFilter(s) { myFilter.status = s; renderMyDemands(); }

async function submitDemand(id) {
  if (!confirm("确认提交该单据？提交后不可编辑，如需修改需撤回。")) return;
  await api(`/api/demands/${id}/submit`, { method: "POST" });
  toast("已提交", "success");
  renderMyDemands();
}
async function withdrawDemand(id) {
  if (!confirm("确认撤回该单据？撤回后可重新编辑提交。")) return;
  await api(`/api/demands/${id}/withdraw`, { method: "POST" });
  toast("已撤回", "success");
  renderMyDemands();
}
async function copyDemand(id) {
  const data = await api(`/api/demands/${id}/copy`, { method: "POST" });
  toast("已复制为草稿", "success");
  loadFillDraft(data.id);
}
async function deleteDemand(id) {
  if (!confirm("确认删除该草稿？删除后不可恢复。")) return;
  await api(`/api/demands/${id}`, { method: "DELETE" });
  toast("已删除", "success");
  renderMyDemands();
}

/* ---------------- 单据详情（通用弹窗） ---------------- */
async function viewDemand(id, withActions = false, actionsHtml = "") {
  const data = await api("/api/demands/" + id);
  const d = data.demand;
  const items = d.items.map((it, i) => `<tr>
    <td>${i + 1}</td><td>${esc(it.material_code)}</td><td>${esc(it.material_name)}</td>
    <td>${esc(it.spec)}</td><td>${esc(it.unit)}</td><td class="t-right">${it.quantity}</td>
    <td class="t-right">${money(it.price)}</td><td class="t-right">${money(it.amount)}</td>
    <td>${esc(it.supplier)}</td></tr>`).join("");
  openModal(`
    <div class="modal-head"><div class="title">单据详情 ${esc(d.order_no)}</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="item"><div class="k">状态</div><div class="v">${STATUS_TAG[d.status]}</div></div>
        <div class="item"><div class="k">填报单位</div><div class="v">${esc(d.department)}</div></div>
        <div class="item"><div class="k">填报日期</div><div class="v">${esc(d.fill_date || "-")}</div></div>
        <div class="item"><div class="k">填表人</div><div class="v">${esc(d.reporter || d.user_name)}</div></div>
        <div class="item"><div class="k">填报账号</div><div class="v">${esc(d.user_name)}</div></div>
        <div class="item"><div class="k">提交时间</div><div class="v">${esc(d.submitted_at || "-")}</div></div>
        <div class="item"><div class="k">审批人</div><div class="v">${esc(d.approved_by || "-")}</div></div>
        <div class="item"><div class="k">审批意见</div><div class="v">${esc(d.approve_comment || "-")}</div></div>
        <div class="item"><div class="k">需求日期</div><div class="v">${esc(d.expect_date || "-")}</div></div>
        <div class="item"><div class="k">收货人</div><div class="v">${esc(d.receiver_name || "-")}</div></div>
        <div class="item"><div class="k">联系电话</div><div class="v">${esc(d.receiver_phone || "-")}</div></div>
        <div class="item"><div class="k">收货地址</div><div class="v">${esc(d.receiver_address || "-")}</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>物料编号</th><th>物料描述</th><th>规格型号</th><th>单位</th><th class="t-right">数量</th><th class="t-right">单价</th><th class="t-right">金额</th><th>供应商</th></tr></thead>
        <tbody>${items}</tbody>
        <tfoot><tr><td colspan="7" class="t-right"><b>合计</b></td><td class="t-right"><b>${money(d.total)}</b></td><td></td></tr></tfoot>
      </table></div>
      ${d.remark ? '<div class="muted small" style="margin-top:8px">备注：' + esc(d.remark) + "</div>" : ""}
    </div>
    <div class="modal-foot">${actionsHtml}<button class="btn" onclick="closeModal()">关闭</button></div>`);
}

/* ---------------- 审批人 ---------------- */
async function renderApprove() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/demands?status=pending");
  if (!data.demands.length) {
    v.innerHTML = '<div class="card"><div class="card-title">待办审批</div><div class="empty">暂无待审批单据</div></div>';
    return;
  }
  const rows = data.demands.map(d => `<tr>
    <td>${esc(d.order_no)}</td><td>${esc(d.department)}</td><td>${esc(d.reporter || d.user_name)}</td>
    <td class="t-right">${money(d.total)}</td>
    <td>${esc(d.submitted_at)}</td>
    <td><button class="btn btn-sm btn-primary" onclick="reviewDemand(${d.id})">审批</button></td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">待办审批 <span class="hint">共 ${data.demands.length} 条</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>单据编号</th><th>填报单位</th><th>填表人</th><th class="t-right">金额(元)</th><th>提交时间</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

async function reviewDemand(id) {
  const data = await api("/api/demands/" + id);
  const d = data.demand;
  const items = d.items.map((it, i) => `<tr>
    <td>${i + 1}</td><td>${esc(it.material_code)}</td><td>${esc(it.material_name)}</td>
    <td>${esc(it.spec)}</td><td>${esc(it.unit)}</td><td class="t-right">${it.quantity}</td>
    <td class="t-right">${money(it.price)}</td><td class="t-right">${money(it.amount)}</td></tr>`).join("");
  openModal(`
    <div class="modal-head"><div class="title">审批单据 ${esc(d.order_no)}</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="item"><div class="k">填报单位</div><div class="v">${esc(d.department)}</div></div>
        <div class="item"><div class="k">填报日期</div><div class="v">${esc(d.fill_date || "-")}</div></div>
        <div class="item"><div class="k">填表人</div><div class="v">${esc(d.reporter || d.user_name)}</div></div>
        <div class="item"><div class="k">填报账号</div><div class="v">${esc(d.user_name)}</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>物料编号</th><th>物料描述</th><th>规格型号</th><th>单位</th><th class="t-right">数量</th><th class="t-right">单价</th><th class="t-right">金额</th></tr></thead>
        <tbody>${items}</tbody>
        <tfoot><tr><td colspan="7" class="t-right"><b>合计</b></td><td class="t-right"><b>${money(d.total)}</b></td></tr></tfoot>
      </table></div>
      <div style="margin-top:14px">
        <label class="muted small">退回原因（退回时必填）</label>
        <textarea id="rejectComment" rows="2" style="width:100%;margin-top:6px;padding:8px;border:1px solid var(--border);border-radius:6px;outline:none" placeholder="如：型号填写不完整，请补充"></textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" onclick="rejectDemand(${id})">退回</button>
      <button class="btn btn-success" onclick="approveDemand(${id})">通过</button>
      <button class="btn" onclick="closeModal()">取消</button>
    </div>`);
}

async function approveDemand(id) {
  await api(`/api/demands/${id}/approve`, { method: "POST" });
  closeModal();
  toast("已审批通过", "success");
  renderApprove();
  refreshBadges();
}
async function rejectDemand(id) {
  const comment = document.getElementById("rejectComment").value.trim();
  if (!comment) { toast("退回必须填写原因", "error"); return; }
  await api(`/api/demands/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) });
  closeModal();
  toast("已退回", "success");
  renderApprove();
  refreshBadges();
}

async function renderApproveDone() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/demands?status=done");
  if (!data.demands.length) {
    v.innerHTML = '<div class="card"><div class="card-title">已办记录</div><div class="empty">暂无已办记录</div></div>';
    return;
  }
  const rows = data.demands.map(d => `<tr>
    <td>${esc(d.order_no)}</td><td>${esc(d.department)}</td><td>${esc(d.reporter || d.user_name)}</td>
    <td class="t-right">${money(d.total)}</td><td>${STATUS_TAG[d.status]}</td>
    <td>${esc(d.approved_at)}</td><td>${esc(d.approve_comment || "-")}</td>
    <td><button class="btn btn-sm" onclick="viewDemand(${d.id})">查看</button></td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">已办记录</div>
    <div class="table-wrap"><table>
      <thead><tr><th>单据编号</th><th>填报单位</th><th>填表人</th><th class="t-right">金额(元)</th><th>状态</th><th>审批时间</th><th>意见</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

/* ---------------- 管理员：物料库 ---------------- */
let matKw = "";
async function renderMaterials() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/materials?kw=" + encodeURIComponent(matKw) + "&limit=100");
  if (!data.materials.length) {
    v.innerHTML = `<div class="card">
      <div class="card-title">标准物料库 <span class="hint">从云梦泽/历史台账导出的Excel批量导入，建立标准物料库</span></div>
      <div class="toolbar">
        <input type="text" id="matSearch" placeholder="搜索物料名称/编号/型号" value="${esc(matKw)}">
        <button class="btn btn-primary" onclick="searchMats()">搜索</button>
        <span class="spacer"></span>
        <button class="btn" onclick="addMaterial()">手动新增</button>
        <label class="btn"><span>批量导入Excel</span><input type="file" accept=".xlsx" style="display:none" onchange="importMaterials(this)"></label>
      </div>
      <div class="empty">物料库为空，请先「批量导入Excel」或「手动新增」。</div></div>`;
    return;
  }
  const rows = data.materials.map(m => `<tr>
    <td>${esc(m.code)}</td><td>${esc(m.name)}</td><td>${esc(m.spec)}</td><td>${esc(m.unit)}</td>
    <td class="t-right">${money(m.price)}</td><td>${esc(m.ecode)}</td><td>${esc(m.supplier)}</td>
    <td>${m.status === "active" ? '<span class="tag tag-approved">在用</span>' : '<span class="tag tag-withdrawn">已下架</span>'}</td>
    <td>
      <button class="btn btn-sm" onclick="editMaterial(${m.id})">编辑</button>
      <button class="btn btn-sm ${m.status === "active" ? "" : "btn-success"}" onclick="toggleMaterial(${m.id})">${m.status === "active" ? "下架" : "启用"}</button>
    </td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">标准物料库 <span class="hint">共 ${data.materials.length} 条</span></div>
    <div class="toolbar">
      <input type="text" id="matSearch" placeholder="搜索物料名称/编号/型号" value="${esc(matKw)}" onkeydown="if(event.key==='Enter')searchMats()">
      <button class="btn btn-primary" onclick="searchMats()">搜索</button>
      <span class="spacer"></span>
      <button class="btn" onclick="addMaterial()">手动新增</button>
      <label class="btn"><span>批量导入Excel</span><input type="file" accept=".xlsx" style="display:none" onchange="importMaterials(this)"></label>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>物料编号</th><th>物料描述</th><th>规格型号</th><th>单位</th><th class="t-right">标准单价</th><th>电商编码</th><th>供应商</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

function searchMats() {
  matKw = document.getElementById("matSearch").value.trim();
  renderMaterials();
}

function materialModal(m) {
  const isEdit = !!m;
  const val = f => m ? esc(m[f]) : "";
  openModal(`
    <div class="modal-head"><div class="title">${isEdit ? "编辑物料" : "新增物料"}</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-item"><label>物料编号</label><input id="mCode" value="${val("code")}"></div>
        <div class="form-item"><label>物料描述（必填）</label><input id="mName" value="${val("name")}"></div>
        <div class="form-item"><label>规格型号</label><input id="mSpec" value="${val("spec")}"></div>
        <div class="form-item"><label>计量单位</label><input id="mUnit" value="${val("unit")}"></div>
        <div class="form-item"><label>标准单价</label><input id="mPrice" type="number" step="any" value="${m ? m.price : ""}"></div>
        <div class="form-item"><label>电商编码</label><input id="mEcode" value="${val("ecode")}"></div>
        <div class="form-item"><label>供应商编码</label><input id="mScode" value="${val("supplier_code")}"></div>
        <div class="form-item"><label>供应商简称</label><input id="mSup" value="${val("supplier")}"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveMaterial(${isEdit ? m.id : "null"})">保存</button>
    </div>`);
}
function addMaterial() { materialModal(null); }
function editMaterial(id) {
  api("/api/materials?kw=&limit=100").then(data => {
    const m = data.materials.find(x => x.id === id);
    if (m) materialModal(m);
  });
}

async function saveMaterial(id) {
  const payload = {
    code: document.getElementById("mCode").value.trim(),
    name: document.getElementById("mName").value.trim(),
    spec: document.getElementById("mSpec").value.trim(),
    unit: document.getElementById("mUnit").value.trim(),
    price: parseFloat(document.getElementById("mPrice").value) || 0,
    ecode: document.getElementById("mEcode").value.trim(),
    supplier_code: document.getElementById("mScode").value.trim(),
    supplier: document.getElementById("mSup").value.trim()
  };
  if (!payload.name) { toast("物料描述不能为空", "error"); return; }
  if (id) {
    await api("/api/materials/" + id, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await api("/api/materials", { method: "POST", body: JSON.stringify(payload) });
  }
  closeModal();
  toast("已保存", "success");
  renderMaterials();
}

async function toggleMaterial(id) {
  await api(`/api/materials/${id}/disable`, { method: "POST" });
  toast("操作成功", "success");
  renderMaterials();
}

async function importMaterials(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/materials/import", { method: "POST", body: fd });
  const data = await res.json();
  input.value = "";
  if (!data.ok) {
    toast(data.msg, "error");
    return;
  }
  const problems = (data.problems || []).slice(0, 50);
  const lines = [
    `新增入库：<b>${data.added}</b> 条`,
    `重复跳过：<b>${data.duplicated}</b> 条`,
    `缺物料描述：<b>${data.missing}</b> 条`,
    `跳过合计/备注等非物料行：<b>${data.non_data}</b> 条`
  ].join("<br>");
  if (problems.length) {
    const list = problems.map(p => `第${p.row}行：${p.reason}`).join("<br>");
    openModal(`
      <div class="modal-head"><div class="title">物料导入结果</div><button class="close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="import-summary">${lines}</div>
        <div style="margin-top:12px"><b>未导入的问题行（${problems.length}条）：</b></div>
        <div class="muted small" style="max-height:220px;overflow:auto;margin-top:6px">${list}</div>
        <div class="muted small" style="margin-top:8px">重复/缺失的物料可先修改Excel后再导入，或直接在下方物料列表中手动新增。</div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" onclick="closeModal()">知道了</button></div>`);
  } else {
    toast(lines.replace(/<br>/g, "；"), "success");
  }
  renderMaterials();
}

/* ---------------- 管理员：需求单管理 + 导出 ---------------- */
let mgFilter = { status: "", department: "", kw: "" };
let selectedIds = new Set();

async function renderDemandManage() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  let url = "/api/demands";
  const params = [];
  if (mgFilter.status) params.push("status=" + mgFilter.status);
  if (mgFilter.kw) params.push("kw=" + encodeURIComponent(mgFilter.kw));
  if (params.length) url += "?" + params.join("&");
  const [data, drData] = await Promise.all([
    api(url),
    api("/api/dept-receivers").catch(() => null)
  ]);
  selectedIds = new Set();
  const chips = [["", "全部"], ["draft", "草稿"], ["pending", "待审批"], ["approved", "已通过"], ["rejected", "已退回"], ["withdrawn", "已撤回"]]
    .map(([k, label]) => `<button class="chip ${mgFilter.status === k ? "active" : ""}" onclick="setMgStatus('${k}')">${label}</button>`).join("");
  const noCfgDepts = (drData && drData.departments || []);
  const recvWarn = noCfgDepts.length
    ? `<div class="recv-warn">系统按数据库自动匹配收货信息，当前以下 ${noCfgDepts.length} 个部门暂无配置：${noCfgDepts.map(d => esc(d)).join("、")}。导出时收货地址/收货人/联系电话将为空，请先在<span class="recv-link" onclick="setActive('deptReceivers')">部门收货配置</span>中设置，或在导出预览中临时填写保存。</div>` : "";
  if (!data.demands.length) {
    v.innerHTML = `<div class="card">
      <div class="card-title">需求单管理</div>
      ${recvWarn}
      <div class="filter-chip">${chips}</div>
      <div class="toolbar" style="margin-top:10px">
        <input type="text" placeholder="搜索单号/部门/填表人" value="${esc(mgFilter.kw)}" id="mgKw" onkeydown="if(event.key==='Enter')setMgKw()">
        <button class="btn btn-primary" onclick="setMgKw()">搜索</button>
      </div>
      <div class="empty">暂无单据</div></div>`;
    return;
  }
  const rows = data.demands.map(d => `<tr>
    <td><input type="checkbox" value="${d.id}" onchange="toggleSelect(this)"></td>
    <td>${esc(d.order_no)}</td><td>${esc(d.department)}</td><td>${esc(d.reporter || d.user_name)}</td>
    <td>${esc(d.fill_date || "-")}</td><td class="t-right">${money(d.total)}</td><td>${STATUS_TAG[d.status]}</td>
    <td>${esc(d.submitted_at)}</td>
    <td><button class="btn btn-sm" onclick="viewDemand(${d.id})">查看</button></td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">需求单管理 <span class="hint">勾选或按筛选条件导出，导出前可预览编辑</span></div>
    ${recvWarn}
    <div class="filter-chip">${chips}</div>
    <div class="toolbar" style="margin-top:10px">
      <input type="text" placeholder="搜索单号/部门/填表人" value="${esc(mgFilter.kw)}" id="mgKw" onkeydown="if(event.key==='Enter')setMgKw()">
      <button class="btn btn-primary" onclick="setMgKw()">搜索</button>
      <button class="btn" onclick="selectAllMine()">全选</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" onclick="openExport()">导出Excel</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>单据编号</th><th>填报单位</th><th>填表人</th><th>填报日期</th><th class="t-right">金额(元)</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

function setMgStatus(s) { mgFilter.status = s; renderDemandManage(); }
function setMgKw() { mgFilter.kw = document.getElementById("mgKw").value.trim(); renderDemandManage(); }
function toggleSelect(cb) {
  if (cb.checked) selectedIds.add(parseInt(cb.value)); else selectedIds.delete(parseInt(cb.value));
}
function selectAllMine() {
  const boxes = document.querySelectorAll('input[type="checkbox"]');
  const allChecked = [...boxes].every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; toggleSelect(b); });
}

let exportRows = [];
let exportTotal = 0;
let addressBookState = [];

function openExport() {
  openModal(`
    <div class="modal-head"><div class="title">导出标准化Excel采购计划单</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="muted small" style="margin-bottom:12px">
        ${selectedIds.size ? `已勾选 <b>${selectedIds.size}</b> 张单据，将导出勾选单据。` : "未勾选单据，将导出当前筛选结果。"}
        生成预览后可编辑（需求日期/收货信息/编码等可手动修改），确认后按标准模板导出。
      </div>
      <div class="form-grid">
        <div class="form-item"><label>按状态过滤（可选）</label>
          <select id="exStatus">
            <option value="">全部状态</option>
            <option value="pending">待审批</option>
            <option value="approved" selected>已通过</option>
            <option value="rejected">已退回</option>
            <option value="draft">草稿</option>
          </select></div>
        <div class="form-item"><label>按部门过滤（可选）</label><input id="exDept" placeholder="留空则全部"></div>
        <div class="form-item"><label>提交起始日期</label><input id="exStart" type="date"></div>
        <div class="form-item"><label>提交截止日期</label><input id="exEnd" type="date"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="doExport()">生成预览</button>
    </div>`);
}

async function doExport() {
  const payload = {
    status: document.getElementById("exStatus").value || "",
    department: document.getElementById("exDept").value.trim(),
    start_date: document.getElementById("exStart").value,
    end_date: document.getElementById("exEnd").value,
    ids: selectedIds.size ? [...selectedIds] : []
  };
  const data = await api("/api/demands/export-preview", { method: "POST", body: JSON.stringify(payload) });
  if (!data.ok) { toast(data.msg, "error"); return; }
  closeModal();
  exportRows = data.rows;
  exportTotal = data.total;
  await renderExportEditor();
}

const EXPORT_COLS = [
  ["code", "物料编号", 130], ["name", "物料描述", 260], ["unit", "单位", 60],
  ["price", "单价", 80], ["quantity", "数量", 80], ["expect_date", "需求日期", 110],
  ["reporter", "提报人", 90], ["address", "收货地址", 200], ["receiver", "收货人", 80],
  ["phone", "联系电话", 120], ["ecode", "电商编码", 130], ["supplier_code", "供应商编码", 100],
  ["supplier", "供应商(缩写)", 110], ["erp_no", "ERP需求计划号", 110], ["order_no", "电商订单号", 110]
];

async function renderExportEditor() {
  const v = document.getElementById("view");
  const heads = ["序号", ...EXPORT_COLS.map(c => c[1]), "计划金额", "操作"];
  const trs = exportRows.map((r, i) => `<tr data-i="${i}" data-did="${r.demand_id ?? ""}" data-iid="${r.item_id ?? ""}">
    <td class="ex-seq">${i + 1}</td>
    ${EXPORT_COLS.map(([f, , w]) =>
      `<td><input class="ex-inp" data-f="${f}" style="width:${w}px" value="${esc(r[f] ?? "")}"></td>`).join("")}
    <td class="ex-amt">${money(r.price * r.quantity)}</td>
    <td><button class="btn btn-sm btn-danger" onclick="delExportRow(this)">删</button></td>
  </tr>`).join("");

  // 加载通用收货地址簿；为空时预置一条空白地址方便填写
  const abData = await api("/api/address-book").catch(() => ({ addresses: [] }));
  addressBookState = (abData.addresses || []).length
    ? abData.addresses.map(a => ({ receiver_name: a.receiver_name || "", receiver_phone: a.receiver_phone || "", receiver_address: a.receiver_address || "" }))
    : [{ receiver_name: "", receiver_phone: "", receiver_address: "" }];
  const defaultDate = (exportRows[0] && exportRows[0].expect_date) ? exportRows[0].expect_date : "";

  const addrListHtml = addressBookState.map((a, i) => `
    <div class="addr-row" data-i="${i}">
      <b class="addr-label">地址 ${i + 1}</b>
      <input class="addr-inp" data-f="receiver_name" value="${esc(a.receiver_name)}" placeholder="收货人">
      <input class="addr-inp" data-f="receiver_phone" value="${esc(a.receiver_phone)}" placeholder="联系电话">
      <input class="addr-inp" data-f="receiver_address" value="${esc(a.receiver_address)}" placeholder="收货地址" style="flex:1;min-width:220px">
      ${addressBookState.length > 1 ? `<button class="btn btn-sm btn-danger" onclick="delAddressRow(${i})">删</button>` : ""}
    </div>`).join("");
  const addrSelectHtml = `
    <div class="addr-match-row">
      <b>应用到本预览</b>
      <select id="addrApplySelect" class="addr-select">
        <option value="-1">按顺序逐行匹配（第 N 条地址 → 第 N 行）</option>
        ${addressBookState.map((a, i) => `<option value="${i}">地址 ${i + 1}${a.receiver_name ? '（' + esc(a.receiver_name) + '）' : ''}</option>`).join("")}
      </select>
      <span class="muted small">选择指定地址时，所有预览行共用该地址</span>
    </div>`;

  v.innerHTML = `
  <div class="card">
    <div class="card-title">导出预览 <span class="hint">共 ${exportRows.length} 行，可编辑后导出（ERP计划号、电商订单号请管理员核对填写）</span></div>
    <div class="recv-panel">
      <div class="recv-title">通用收货信息 <span class="hint">第 N 条地址 → 第 N 行；只有 1 条地址时所有行共用该地址</span></div>
      <div class="recv-date-row">
        <b>需求日期</b>
        <input type="date" id="recvExpectDate" value="${esc(defaultDate)}">
        <span class="muted small">保存时填充到本预览所有行的「需求日期」列</span>
      </div>
      ${addrSelectHtml}
      <div id="addrBookList">${addrListHtml}</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="addAddressRow()">+ 增加一条收货地址</button>
        <button class="btn btn-primary btn-sm" onclick="savePreviewReceivers()">保存收货信息并应用到本预览</button>
      </div>
    </div>
    <div class="muted small" style="margin-bottom:10px;background:#fff7e6;border:1px solid #ffe1a8;padding:8px 10px;border-radius:6px">
      可直接修改任意单元格；单价/数量修改后金额自动重算；不需要的行点「删」移除；确认无误后点「导出Excel」。
    </div>
    <div class="table-wrap" style="max-height:55vh"><table id="exportEditor">
      <thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${trs}</tbody>
    </table></div>
    <div style="display:flex;align-items:center;gap:14px;margin-top:14px;flex-wrap:wrap">
      <span>合计金额：<b class="ex-total" style="color:#c0392b">${money(calcExportTotal())} 元</b></span>
      <span class="spacer"></span>
      <button class="btn" onclick="renderDemandManage()">返回重新筛选</button>
      <button class="btn btn-primary" onclick="confirmExport()">确认导出 Excel</button>
    </div>
  </div>`;
  v.querySelectorAll(".ex-inp[data-f='price'], .ex-inp[data-f='quantity']").forEach(inp => {
    inp.addEventListener("input", e => {
      const tr = e.target.closest("tr");
      const price = parseFloat(tr.querySelector("[data-f='price']").value) || 0;
      const qty = parseFloat(tr.querySelector("[data-f='quantity']").value) || 0;
      tr.querySelector(".ex-amt").textContent = money(price * qty);
      v.querySelector(".ex-total").textContent = money(calcExportTotal()) + " 元";
    });
  });
}

function collectAddressBookFromDom() {
  const items = [];
  document.querySelectorAll("#addrBookList .addr-row").forEach(row => {
    const item = { receiver_name: "", receiver_phone: "", receiver_address: "" };
    row.querySelectorAll(".addr-inp").forEach(inp => { item[inp.dataset.f] = inp.value.trim(); });
    items.push(item);
  });
  return items;
}

function renderAddressList() {
  const container = document.getElementById("addrBookList");
  if (!container) return;
  container.innerHTML = addressBookState.map((a, i) => `
    <div class="addr-row" data-i="${i}">
      <b class="addr-label">地址 ${i + 1}</b>
      <input class="addr-inp" data-f="receiver_name" value="${esc(a.receiver_name)}" placeholder="收货人">
      <input class="addr-inp" data-f="receiver_phone" value="${esc(a.receiver_phone)}" placeholder="联系电话">
      <input class="addr-inp" data-f="receiver_address" value="${esc(a.receiver_address)}" placeholder="收货地址" style="flex:1;min-width:220px">
      ${addressBookState.length > 1 ? `<button class="btn btn-sm btn-danger" onclick="delAddressRow(${i})">删</button>` : ""}
    </div>`).join("");
  refreshAddrApplySelect();
}

function refreshAddrApplySelect() {
  const sel = document.getElementById("addrApplySelect");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="-1">按顺序逐行匹配（第 N 条地址 → 第 N 行）</option>` +
    addressBookState.map((a, i) => `<option value="${i}">地址 ${i + 1}${a.receiver_name ? '（' + esc(a.receiver_name) + '）' : ''}</option>`).join("");
  const valid = (cur === "-1" || (parseInt(cur, 10) >= 0 && parseInt(cur, 10) < addressBookState.length));
  sel.value = valid ? cur : "-1";
}

function addAddressRow() {
  addressBookState = collectAddressBookFromDom();
  addressBookState.push({ receiver_name: "", receiver_phone: "", receiver_address: "" });
  renderAddressList();
}

function delAddressRow(i) {
  if (addressBookState.length <= 1) { toast("至少保留一条地址", "error"); return; }
  addressBookState = collectAddressBookFromDom();
  addressBookState.splice(i, 1);
  renderAddressList();
}

async function savePreviewReceivers() {
  addressBookState = collectAddressBookFromDom();
  const items = addressBookState.filter(a => a.receiver_name || a.receiver_phone || a.receiver_address);
  if (!items.length) { toast("请至少填写一条收货地址", "error"); return; }
  const expectDate = document.getElementById("recvExpectDate").value.trim();
  const data = await api("/api/address-book", { method: "POST", body: JSON.stringify({ addresses: items }) });
  if (!data.ok) { toast(data.msg, "error"); return; }
  // 应用需求日期到所有行
  let n = 0;
  document.querySelectorAll("#exportEditor tbody tr").forEach(tr => {
    const inp = tr.querySelector("[data-f='expect_date']");
    if (inp && expectDate && !inp.value.trim()) { inp.value = expectDate; n++; }
  });
  // 应用地址到预览行：选择指定地址时所有行共用该地址，且每次点击都覆盖刷新（可反复切换地址）；
  // 未选择具体地址时按顺序逐行匹配，仅填充空单元格（自动补全）
  const modeSel = document.getElementById("addrApplySelect");
  const selectedIdx = modeSel ? parseInt(modeSel.value, 10) : -1;
  if (selectedIdx >= 0) {
    const a = addressBookState[selectedIdx];
    if (a && (a.receiver_name || a.receiver_phone || a.receiver_address)) {
      document.querySelectorAll("#exportEditor tbody tr").forEach(tr => {
        const rInp = tr.querySelector("[data-f='receiver']");
        const pInp = tr.querySelector("[data-f='phone']");
        const aInp = tr.querySelector("[data-f='address']");
        if (rInp && a.receiver_name) { rInp.value = a.receiver_name; n++; }
        if (pInp && a.receiver_phone) { pInp.value = a.receiver_phone; n++; }
        if (aInp && a.receiver_address) { aInp.value = a.receiver_address; n++; }
      });
      toast(`${data.msg}，已覆盖刷新 ${n} 个单元格（可切换其他地址后再次点击刷新）`, "success");
      return;
    }
    toast("所选地址为空，未刷新预览（请先填写该地址的收货信息）", "error");
    return;
  }
  document.querySelectorAll("#exportEditor tbody tr").forEach((tr, i) => {
    const a = items[i] || items[items.length - 1];
    if (!a) return;
    const rInp = tr.querySelector("[data-f='receiver']");
    const pInp = tr.querySelector("[data-f='phone']");
    const aInp = tr.querySelector("[data-f='address']");
    if (rInp && !rInp.value.trim() && a.receiver_name) { rInp.value = a.receiver_name; n++; }
    if (pInp && !pInp.value.trim() && a.receiver_phone) { pInp.value = a.receiver_phone; n++; }
    if (aInp && !aInp.value.trim() && a.receiver_address) { aInp.value = a.receiver_address; n++; }
  });
  toast(`${data.msg}，已应用到 ${n} 个空单元格`, "success");
}

function calcExportTotal() {
  let t = 0;
  document.querySelectorAll("#exportEditor tbody tr").forEach(tr => {
    const price = parseFloat(tr.querySelector("[data-f='price']").value) || 0;
    const qty = parseFloat(tr.querySelector("[data-f='quantity']").value) || 0;
    t += price * qty;
  });
  return t;
}

function delExportRow(btn) {
  const tr = btn.closest("tr");
  tr.remove();
  document.querySelectorAll("#exportEditor tbody tr").forEach((tr, i) => {
    tr.dataset.i = i;
    tr.querySelector(".ex-seq").textContent = i + 1;
  });
  const v = document.getElementById("view");
  const total = v.querySelector(".ex-total");
  if (total) total.textContent = money(calcExportTotal()) + " 元";
}

async function confirmExport() {
  const rows = [];
  document.querySelectorAll("#exportEditor tbody tr").forEach(tr => {
    const r = {};
    tr.querySelectorAll(".ex-inp").forEach(inp => { r[inp.dataset.f] = inp.value.trim(); });
    const price = parseFloat(r.price) || 0;
    const qty = parseFloat(r.quantity) || 0;
    r.price = price; r.quantity = qty;
    r.amount = Math.round(price * qty * 100) / 100;
    // 携带来源单据/明细 ID，导出成功后回写 ERP号/电商订单号/需求日期/收货信息
    const did = tr.dataset.did ? parseInt(tr.dataset.did, 10) : null;
    const iid = tr.dataset.iid ? parseInt(tr.dataset.iid, 10) : null;
    if (did) r.demand_id = did;
    if (iid) r.item_id = iid;
    rows.push(r);
  });
  if (!rows.length) { toast("没有可导出的行", "error"); return; }
  const data = await api("/api/demands/export", { method: "POST", body: JSON.stringify({ rows }) });
  if (!data.ok) { toast(data.msg, "error"); return; }
  const a = document.createElement("a");
  a.href = "/api/export/" + encodeURIComponent(data.file);
  a.download = data.file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(data.msg, "success");
  exportRows = [];
  renderDemandManage();
}

/* ---------------- 管理员：新物料申请审核 ---------------- */
async function renderMatRequests() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/material-requests?status=pending");
  if (!data.requests.length) {
    v.innerHTML = '<div class="card"><div class="card-title">新物料入库申请 <span class="hint">员工提交的新物料申请在此审核</span></div><div class="empty">暂无待审核的新物料申请</div></div>';
    return;
  }
  const rows = data.requests.map(r => `<tr>
    <td>${esc(r.created_by_name)}</td><td>${esc(r.name)}</td><td>${esc(r.spec)}</td><td>${esc(r.unit)}</td>
    <td>${esc(r.remark)}</td><td>${esc(r.created_at)}</td>
    <td><button class="btn btn-sm btn-primary" onclick="reviewMatReq(${r.id})">审核</button></td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">新物料入库申请 <span class="hint">共 ${data.requests.length} 条待审核</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>申请人</th><th>物料描述</th><th>规格型号</th><th>单位</th><th>用途说明</th><th>提交时间</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

async function reviewMatReq(id) {
  const data = await api("/api/material-requests");
  const r = data.requests.find(x => x.id === id);
  if (!r) return;
  openModal(`
    <div class="modal-head"><div class="title">审核新物料申请</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="item"><div class="k">申请人</div><div class="v">${esc(r.created_by_name)}</div></div>
        <div class="item"><div class="k">物料描述</div><div class="v">${esc(r.name)}</div></div>
        <div class="item"><div class="k">规格型号</div><div class="v">${esc(r.spec || "-")}</div></div>
        <div class="item"><div class="k">单位</div><div class="v">${esc(r.unit || "-")}</div></div>
      </div>
      <div class="muted small" style="margin:8px 0 12px">用途：${esc(r.remark || "-")}</div>
      <div class="muted small" style="margin-bottom:8px">通过后请补全以下专业字段（可参照云梦泽数据）：</div>
      <div class="form-grid">
        <div class="form-item"><label>物料编号</label><input id="rmCode"></div>
        <div class="form-item"><label>标准单价</label><input id="rmPrice" type="number" step="any"></div>
        <div class="form-item"><label>电商编码</label><input id="rmEcode"></div>
        <div class="form-item"><label>供应商编码</label><input id="rmScode"></div>
        <div class="form-item"><label>供应商简称</label><input id="rmSup"></div>
        <div class="form-item"><label>审核意见</label><input id="rmComment" placeholder="驳回时必填"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" onclick="submitMatReqReview(${id}, 'rejected')">驳回</button>
      <button class="btn btn-success" onclick="submitMatReqReview(${id}, 'approved')">通过并入库</button>
      <button class="btn" onclick="closeModal()">取消</button>
    </div>`);
}

async function submitMatReqReview(id, action) {
  const payload = {
    action,
    comment: document.getElementById("rmComment").value.trim(),
    code: document.getElementById("rmCode").value.trim(),
    price: parseFloat(document.getElementById("rmPrice").value) || 0,
    ecode: document.getElementById("rmEcode").value.trim(),
    supplier_code: document.getElementById("rmScode").value.trim(),
    supplier: document.getElementById("rmSup").value.trim()
  };
  if (action === "rejected" && !payload.comment) { toast("驳回必须填写原因", "error"); return; }
  await api(`/api/material-requests/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  closeModal();
  toast("处理完成", "success");
  renderMatRequests();
  refreshBadges();
}

/* ---------------- 管理员：导出模板管理 ---------------- */
async function renderTemplates() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/templates");
  const list = data.templates.length ? data.templates.map(t => `<tr>
    <td>${t.active ? '<span class="tag tag-approved">使用中</span>' : ""}</td>
    <td>${esc(t.name)}</td>
    <td>${(t.size / 1024).toFixed(1)} KB</td>
    <td>${esc(t.mtime)}</td>
    <td>
      ${t.active ? '<span class="muted small">当前模板</span>'
        : `<button class="btn btn-sm btn-primary" onclick="activateTemplate('${esc(t.name)}')">设为当前</button>
           <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${esc(t.name)}')">删除</button>`}
    </td></tr>`).join("")
    : '<tr><td colspan="5" class="empty">暂无模板，可上传单位现行需求计划单模板</td></tr>';
  v.innerHTML = `<div class="card">
    <div class="card-title">导出模板管理 <span class="hint">导出Excel按"使用中"模板格式生成；可上传替换，方便模板调整</span></div>
    <div class="toolbar">
      <label class="btn btn-primary"><span>上传新模板（.xlsx）</span><input type="file" accept=".xlsx,.xls" style="display:none" onchange="uploadTemplate(this)"></label>
      <span class="muted small">上传后需在列表中点击「设为当前」启用</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>状态</th><th>模板文件名</th><th>大小</th><th>修改时间</th><th>操作</th></tr></thead>
      <tbody>${list}</tbody></table></div>
    <div class="muted small" style="margin-top:10px">
      模板表头需含：物料编号、物料描述、单位、单价、数量、计划金额、需求日期、提报人、收货地址、收货人、联系电话、电商编码、供应商编码、供应商、ERP需求计划号、电商订单号（可缺列，系统按能识别的列填充）。
    </div>
  </div>`;
}

async function uploadTemplate(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/templates/upload", { method: "POST", body: fd });
  const data = await res.json();
  input.value = "";
  toast(data.msg, data.ok ? "success" : "error");
  if (data.ok) renderTemplates();
}

async function activateTemplate(name) {
  const data = await api("/api/templates/activate", { method: "POST", body: JSON.stringify({ name }) });
  toast(data.msg, data.ok ? "success" : "error");
  if (data.ok) renderTemplates();
}

async function deleteTemplate(name) {
  if (!confirm("确认删除模板 " + name + " ？")) return;
  const data = await api("/api/templates/delete", { method: "POST", body: JSON.stringify({ name }) });
  toast(data.msg, data.ok ? "success" : "error");
  if (data.ok) renderTemplates();
}

/* ---------------- 超管：用户管理 ---------------- */
async function renderUsers() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/users");
  const rows = data.users.map(u => `<tr>
    <td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(u.department)}</td>
    <td><span class="tag tag-pending_req">${ROLE_NAME[u.role]}</span></td>
    <td>${u.status === "active" ? '<span class="tag tag-approved">正常</span>' : '<span class="tag tag-withdrawn">已停用</span>'}</td>
    <td>${esc(u.created_at)}</td>
    <td>
      <button class="btn btn-sm" onclick="editUser(${u.id})">编辑</button>
      <button class="btn btn-sm" onclick="resetPwd(${u.id})">重置密码</button>
      <button class="btn btn-sm ${u.status === "active" ? "" : "btn-success"}" onclick="toggleUser(${u.id})">${u.status === "active" ? "停用" : "启用"}</button>
    </td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">用户管理 <span class="hint">创建账号并分配权限（开发者/高级管理员/普通员工），可配置各部门收货人/收货地址/联系电话（导出时自动带出）</span></div>
    <div class="toolbar">
      <button class="btn btn-primary" onclick="addUser()">＋ 新建账号</button>
      <span class="muted small">初始密码默认 123456，通知用户登录后修改；「编辑」可设置部门收货信息</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>用户名</th><th>姓名</th><th>部门</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

function roleOptions(selected) {
  const opts = [
    { v: "employee", l: "普通员工（仅物资填报）" },
    { v: "admin", l: "高级管理员（除开发者管理外全部功能）" }
  ];
  if (USER.role === "super") opts.push({ v: "super", l: "开发者（全部权限）" });
  if (selected === "approver") opts.unshift({ v: "approver", l: "审批人（兼容存量账号）" });
  return opts.map(o => `<option value="${o.v}" ${selected === o.v ? "selected" : ""}>${o.l}</option>`).join("");
}

function addUser() {
  openModal(`
    <div class="modal-head"><div class="title">新建账号</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-item"><label>用户名（登录用）</label><input id="uName" placeholder="如：zhangsan"></div>
        <div class="form-item"><label>姓名</label><input id="uReal" placeholder="如：张三"></div>
        <div class="form-item"><label>部门</label><input id="uDept" placeholder="如：采油一队"></div>
        <div class="form-item"><label>角色</label>
          <select id="uRole">${roleOptions("")}</select></div>
        <div class="form-item"><label>初始密码</label><input id="uPwd" value="123456"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="createUser()">创建</button>
    </div>`);
}

async function createUser() {
  const payload = {
    username: document.getElementById("uName").value.trim(),
    name: document.getElementById("uReal").value.trim(),
    department: document.getElementById("uDept").value.trim(),
    role: document.getElementById("uRole").value,
    password: document.getElementById("uPwd").value || "123456"
  };
  if (!payload.username) { toast("请输入用户名", "error"); return; }
  await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
  closeModal();
  toast("账号创建成功", "success");
  renderUsers();
}
async function editUser(id) {
  const data = await api("/api/users");
  const u = data.users.find(x => x.id === id);
  if (!u) return;
  openModal(`
    <div class="modal-head"><div class="title">编辑账号：${esc(u.username)}</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="muted small" style="background:#eef7ee;border:1px solid #cfe6cf;padding:8px 10px;border-radius:6px;margin-bottom:10px">
        收货人/联系电话/收货地址用于导出采购计划单时自动带出（对应模板「收货地址、收货人、联系电话」列），请按本部门实际收货信息填写。
      </div>
      <div class="form-grid">
        <div class="form-item"><label>姓名</label><input id="euReal" value="${esc(u.name)}"></div>
        <div class="form-item"><label>部门</label><input id="euDept" value="${esc(u.department)}"></div>
        <div class="form-item"><label>角色</label>
          <select id="euRole">${roleOptions(u.role)}</select></div>
        <div class="form-item"><label>收货人</label><input id="euReceiver" value="${esc(u.receiver_name)}" placeholder="如：张三"></div>
        <div class="form-item"><label>联系电话</label><input id="euPhone" value="${esc(u.receiver_phone)}" placeholder="如：138****09812"></div>
        <div class="form-item" style="grid-column:1/-1"><label>收货地址</label><input id="euAddress" value="${esc(u.receiver_address)}" placeholder="如：河北省廊坊市XX路XX院XX楼XX室"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveUserEdit(${u.id})">保存</button>
    </div>`);
}

async function saveUserEdit(id) {
  const payload = {
    name: document.getElementById("euReal").value.trim(),
    department: document.getElementById("euDept").value.trim(),
    role: document.getElementById("euRole").value,
    receiver_name: document.getElementById("euReceiver").value.trim(),
    receiver_phone: document.getElementById("euPhone").value.trim(),
    receiver_address: document.getElementById("euAddress").value.trim()
  };
  if (!payload.name) { toast("请输入姓名", "error"); return; }
  const data = await api("/api/users/" + id, { method: "PUT", body: JSON.stringify(payload) });
  if (!data.ok) { toast(data.msg, "error"); return; }
  closeModal();
  toast(data.msg, "success");
  renderUsers();
}

async function resetPwd(id) {
  if (!confirm("确认将该账号密码重置为 123456？")) return;
  await api(`/api/users/${id}/reset-password`, { method: "POST" });
  toast("已重置为 123456", "success");
}
async function toggleUser(id) {
  await api(`/api/users/${id}/toggle`, { method: "POST" });
  toast("操作成功", "success");
  renderUsers();
}

/* ---------------- 部门收货信息配置（导出时自动匹配） ---------------- */
async function renderDeptReceivers() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/dept-receivers");
  const escV = val => esc(val ?? "");
  const rowHtml = dept => `
    <tr data-dept="${escV(dept)}">
      <td><b>${escV(dept)}</b></td>
      <td><input class="dr-inp" data-f="receiver_name" value="${escV(data.receivers.find(r => r.department === dept)?.receiver_name)}" placeholder="如：张三"></td>
      <td><input class="dr-inp" data-f="receiver_phone" value="${escV(data.receivers.find(r => r.department === dept)?.receiver_phone)}" placeholder="如：13800000000"></td>
      <td><input class="dr-inp" data-f="receiver_address" value="${escV(data.receivers.find(r => r.department === dept)?.receiver_address)}" placeholder="如：河北省廊坊市XX路XX号" style="min-width:300px"></td>
    </tr>`;
  const configured = data.receivers.map(r => rowHtml(r.department)).join("");
  const emptyRows = data.departments.map(d => rowHtml(d)).join("");
  const noDept = !configured && !emptyRows;
  v.innerHTML = `<div class="card">
    <div class="card-title">部门收货信息配置 <span class="hint">导出采购计划单时自动匹配带出（优先级：单据已填 > 填报人账号配置 > 部门配置）</span></div>
    <div class="muted small" style="background:#eef7ee;border:1px solid #cfe6cf;padding:8px 10px;border-radius:6px;margin-bottom:10px">
      在此按部门统一维护收货人/联系电话/收货地址，管理员导出 Excel 时无需手工填写即可自动带出；若部门账号已在「用户管理」中配置收货信息，则以账号配置优先。
    </div>
    ${noDept ? '<div class="muted" style="margin:16px 0">当前暂无部门数据，请先在「需求单管理」中录入单据，或在「用户管理」中创建带部门账号。</div>' : `
    <div class="table-wrap"><table>
      <thead><tr><th>部门</th><th>收货人</th><th>联系电话</th><th>收货地址</th></tr></thead>
      <tbody>${configured}${emptyRows}</tbody>
    </table></div>
    <div style="display:flex;align-items:center;gap:14px;margin-top:14px">
      <button class="btn btn-primary" onclick="saveDeptReceivers()">保存全部配置</button>
      <span class="muted small">未填写任何信息的行将被忽略</span>
    </div>`}
  </div>`;
}

async function saveDeptReceivers() {
  const items = [];
  document.querySelectorAll("#view .dr-inp").forEach(inp => {
    const tr = inp.closest("tr");
    const dept = tr.dataset.dept;
    let item = items.find(x => x.department === dept);
    if (!item) { item = { department: dept, receiver_name: "", receiver_phone: "", receiver_address: "" }; items.push(item); }
    item[inp.dataset.f] = inp.value.trim();
  });
  const filled = items.filter(x => x.receiver_name || x.receiver_phone || x.receiver_address);
  if (!filled.length) { toast("请至少填写一个部门的收货信息", "error"); return; }
  const data = await api("/api/dept-receivers", { method: "POST", body: JSON.stringify({ items: filled }) });
  if (!data.ok) { toast(data.msg, "error"); return; }
  toast(data.msg, "success");
  renderDeptReceivers();
}

/* ---------------- 超管：操作日志 ---------------- */
async function renderLogs() {
  const v = document.getElementById("view");
  v.innerHTML = '<div class="loading">加载中...</div>';
  const data = await api("/api/logs");
  if (!data.logs.length) {
    v.innerHTML = '<div class="card"><div class="card-title">操作日志</div><div class="empty">暂无日志</div></div>';
    return;
  }
  const rows = data.logs.map(l => `<tr>
    <td>${esc(l.created_at)}</td><td>${esc(l.username)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join("");
  v.innerHTML = `<div class="card">
    <div class="card-title">操作日志 <span class="hint">全流程留痕，可追溯</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>详情</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

/* ---------------- 用户菜单 ---------------- */
function showChangePassword() {
  document.getElementById("userMenu").classList.remove("show");
  openModal(`
    <div class="modal-head"><div class="title">修改密码</div><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-item"><label>原密码</label><input id="cpOld" type="password"></div>
        <div class="form-item"><label>新密码（至少6位）</label><input id="cpNew" type="password"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="changePassword()">确认修改</button>
    </div>`);
}
async function changePassword() {
  const old_password = document.getElementById("cpOld").value;
  const new_password = document.getElementById("cpNew").value;
  if (!old_password || new_password.length < 6) { toast("请填写原密码，新密码至少6位", "error"); return; }
  await api("/api/change-password", { method: "POST", body: JSON.stringify({ old_password, new_password }) });
  closeModal();
  toast("密码已修改", "success");
}
async function logout() {
  await api("/api/logout", { method: "POST" });
  location.href = "/";
}
document.addEventListener("click", e => {
  const menu = document.getElementById("userMenu");
  if (!menu) return;
  if (!e.target.closest(".dropdown")) menu.classList.remove("show");
});
document.getElementById("userMenuBtn")?.addEventListener("click", e => {
  e.stopPropagation();
  document.getElementById("userMenu").classList.toggle("show");
});

/* ---------------- 初始化 ---------------- */
async function init() {
  try {
    const data = await api("/api/me");
    USER = data.user;
    document.getElementById("userName").textContent = USER.name || USER.username;
    document.getElementById("userRoleBadge").textContent = ROLE_NAME[USER.role] || USER.role;
    const navs = NAVS[USER.role];
    document.getElementById("nav").innerHTML = navs.map(n =>
      `<div class="nav-item" data-nav="${n.key}" onclick="setActive('${n.key}')">${n.label}</div>`).join("");
    setActive(navs[0].key);
    refreshBadges();
  } catch (e) {
    if (e.message === "未登录") location.href = "/";
  }
}
init();
