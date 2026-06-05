// ════════════════════════════════════════
// Data Layer
// ════════════════════════════════════════
const STORAGE_KEY = 'todos';

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTodos(todos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function generateId() {
  return crypto.randomUUID();
}

function reorderTodos(todos) {
  todos.forEach((t, i) => { t.order = i; });
}

// ── Recurrence reset logic ──
function asTaiwan(utcMs) {
  return new Date(utcMs + 8 * 3600 * 1000);
}

function getResetBoundaryUtc(recurrence) {
  const nowUtc = Date.now();
  const tw = asTaiwan(nowUtc);

  if (recurrence === 'daily') {
    const tw4am = new Date(tw);
    tw4am.setUTCHours(4, 0, 0, 0);
    if (tw4am.getTime() > tw.getTime()) tw4am.setUTCDate(tw4am.getUTCDate() - 1);
    return tw4am.getTime() - 8 * 3600 * 1000;
  }
  if (recurrence === 'weekly') {
    const twMon = new Date(tw);
    const dow = twMon.getUTCDay();
    twMon.setUTCDate(twMon.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    twMon.setUTCHours(4, 0, 0, 0);
    if (twMon.getTime() > tw.getTime()) twMon.setUTCDate(twMon.getUTCDate() - 7);
    return twMon.getTime() - 8 * 3600 * 1000;
  }
  if (recurrence === 'monthly') {
    const twFirst = new Date(tw);
    twFirst.setUTCDate(1);
    twFirst.setUTCHours(4, 0, 0, 0);
    if (twFirst.getTime() > tw.getTime()) twFirst.setUTCMonth(twFirst.getUTCMonth() - 1);
    return twFirst.getTime() - 8 * 3600 * 1000;
  }
  return null;
}

function checkRecurringResets() {
  let changed = false;
  todos.forEach(todo => {
    if (!todo.recurrence || todo.recurrence === 'none') return;
    const boundary = getResetBoundaryUtc(todo.recurrence);
    if (boundary === null) return;
    const lastReset = todo.lastResetAt ?? todo.createdAt;
    if (lastReset < boundary) {
      todo.subtasks = (todo.subtasks || []).map(s => ({ ...s, done: false }));
      todo.lastResetAt = Date.now();
      changed = true;
    }
  });
  if (changed) saveTodos(todos);
}

// App state
let todos = loadTodos();
checkRecurringResets();
let editingId  = null;
let draggingId = null;
const selectedSubtasks = new Set();

// ════════════════════════════════════════
// Render
// ════════════════════════════════════════
const cardGrid = document.getElementById('card-grid');

function renderCards() {
  cardGrid.innerHTML = '';
  let sorted = [...todos].sort((a, b) => a.order - b.order);

  if (selectedSubtasks.size > 0) {
    const matches = t => (t.subtasks || []).some(s => selectedSubtasks.has(s.text));
    sorted = [...sorted.filter(matches), ...sorted.filter(t => !matches(t))];
  }

  if (sorted.length === 0) {
    cardGrid.innerHTML = `
      <div class="empty-state">
        <p>目前沒有任何任務</p>
        <small>點擊右上角「新增任務」開始吧！</small>
      </div>`;
    return;
  }

  sorted.forEach(todo => cardGrid.appendChild(createCardElement(todo)));
}

function createCardElement(todo) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = todo.id;
  card.draggable = true;

  // Title row (text + optional recurrence badge)
  const title = document.createElement('div');
  title.className = 'card-title';

  const titleText = document.createElement('span');
  titleText.className = 'card-title-text';
  titleText.textContent = todo.title;
  title.appendChild(titleText);

  if (todo.recurrence && todo.recurrence !== 'none') {
    const RMAP = { daily: '每日', weekly: '每週', monthly: '每月' };
    const rbadge = document.createElement('span');
    rbadge.className = 'recurrence-badge';
    rbadge.textContent = RMAP[todo.recurrence] || '';
    title.appendChild(rbadge);
  }

  card.appendChild(title);

  // Description (hide if empty)
  if (todo.description) {
    const desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.textContent = todo.description;
    card.appendChild(desc);
  }

  // Progress bar (only when there are subtasks)
  if (todo.subtasks && todo.subtasks.length > 0) {
    card.appendChild(buildProgressBar(todo));
    card.appendChild(buildSubtaskList(todo));
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const btnEdit = document.createElement('button');
  btnEdit.className = 'btn-edit';
  btnEdit.textContent = '編輯';
  btnEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(todo);
  });

  const btnDelete = document.createElement('button');
  btnDelete.className = 'btn-delete';
  btnDelete.textContent = '刪除';
  btnDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTask(todo.id);
  });

  actions.appendChild(btnDelete);
  actions.appendChild(btnEdit);
  card.appendChild(actions);

  // Drag events
  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragover',  onDragOver);
  card.addEventListener('dragleave', onDragLeave);
  card.addEventListener('drop',      onDrop);
  card.addEventListener('dragend',   onDragEnd);

  return card;
}

function buildProgressBar(todo) {
  const doneCount = todo.subtasks.filter(s => s.done).length;
  const total     = todo.subtasks.length;
  const pct       = Math.round((doneCount / total) * 100);

  const wrap = document.createElement('div');
  wrap.className = 'progress-wrap';

  const info = document.createElement('div');
  info.className = 'progress-info';
  info.textContent = `${doneCount} / ${total} 完成`;

  const bar  = document.createElement('div');
  bar.className = 'progress-bar';

  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = `${pct}%`;

  bar.appendChild(fill);
  wrap.appendChild(info);
  wrap.appendChild(bar);
  return wrap;
}

function buildSubtaskList(todo) {
  const ul = document.createElement('ul');
  ul.className = 'subtask-list';

  todo.subtasks.forEach(sub => {
    const li  = document.createElement('li');
    li.className = 'subtask-item' + (sub.done ? ' done' : '');

    const cb  = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = sub.done;
    cb.id      = `sub-${sub.id}`;
    cb.addEventListener('change', () => toggleSubtask(todo.id, sub.id, cb.checked));

    const lbl   = document.createElement('label');
    lbl.htmlFor = `sub-${sub.id}`;
    lbl.textContent = sub.text;
    if (selectedSubtasks.has(sub.text)) {
      lbl.classList.add('subtask-highlight');
    }

    li.appendChild(cb);
    li.appendChild(lbl);

    if (sub.victoryCondition) {
      const VMAP = { S: 'S勝', A: 'A勝', port: '母港到達' };
      const vBadge = document.createElement('span');
      vBadge.className = 'victory-badge';
      vBadge.style.marginLeft = '6px';
      vBadge.textContent = VMAP[sub.victoryCondition] || '';
      li.appendChild(vBadge);
    }

    ul.appendChild(li);
  });

  return ul;
}

// ════════════════════════════════════════
// Delete
// ════════════════════════════════════════
function deleteTask(id) {
  if (!confirm('確定要刪除這個任務嗎？')) return;
  todos = todos.filter(t => t.id !== id);
  reorderTodos(todos);
  saveTodos(todos);
  renderCards();
}

// ════════════════════════════════════════
// Subtask toggle
// ════════════════════════════════════════
function toggleSubtask(todoId, subId, done) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;
  const sub = todo.subtasks.find(s => s.id === subId);
  if (!sub) return;
  sub.done = done;
  saveTodos(todos);
  renderCards();
}

// ════════════════════════════════════════
// Drag & Drop
// ════════════════════════════════════════
function onDragStart(e) {
  draggingId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (e.currentTarget.dataset.id !== draggingId) {
    e.currentTarget.classList.add('drag-over');
  }
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  e.currentTarget.classList.remove('drag-over');

  if (!draggingId || draggingId === targetId) return;

  const draggingTodo = todos.find(t => t.id === draggingId);
  const targetTodo   = todos.find(t => t.id === targetId);
  if (!draggingTodo || !targetTodo) return;

  const tmp           = draggingTodo.order;
  draggingTodo.order  = targetTodo.order;
  targetTodo.order    = tmp;

  saveTodos(todos);
  renderCards();
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.card').forEach(c => c.classList.remove('drag-over'));
  draggingId = null;
}

// ════════════════════════════════════════
// Modal
// ════════════════════════════════════════
const modalOverlay  = document.getElementById('modal-overlay');
const modalTitleEl  = document.getElementById('modal-title');
const inputTitle    = document.getElementById('input-title');
const inputDesc     = document.getElementById('input-desc');
const subtaskInputs = document.getElementById('subtask-inputs');
const titleError    = document.getElementById('title-error');

function openModal(todo = null) {
  editingId = todo ? todo.id : null;
  modalTitleEl.textContent = todo ? '編輯任務' : '新增任務';
  inputTitle.value = todo ? todo.title : '';
  inputDesc.value  = todo ? (todo.description || '') : '';
  titleError.classList.remove('show');

  subtaskInputs.innerHTML = '';
  if (todo && todo.subtasks) {
    todo.subtasks.forEach(sub => addSubtaskInput(sub.text, sub.victoryCondition || ''));
  }

  document.querySelectorAll('input[name="recurrence"]').forEach(r => {
    r.checked = r.value === (todo ? (todo.recurrence || 'none') : 'none');
  });

  modalOverlay.classList.add('open');
  inputTitle.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  editingId = null;
}

function addSubtaskInput(value = '', victoryCondition = 'S') {
  const uid = generateId();
  const li = document.createElement('li');
  li.className = 'subtask-input-item';

  // Text input + remove button row
  const row = document.createElement('div');
  row.className = 'subtask-input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '輸入子任務內容';
  input.value = value;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSubtaskInput(); }
  });

  const btnRemove = document.createElement('button');
  btnRemove.type = 'button';
  btnRemove.className = 'btn-remove-subtask';
  btnRemove.textContent = '✕';
  btnRemove.addEventListener('click', () => li.remove());

  row.appendChild(input);
  row.appendChild(btnRemove);

  // Victory condition radio group (per subtask)
  const radioWrap = document.createElement('div');
  radioWrap.className = 'subtask-victory-radios';

  [['S', 'S勝'], ['A', 'A勝'], ['port', '母港到達']].forEach(([val, text]) => {
    const lbl = document.createElement('label');
    const rb  = document.createElement('input');
    rb.type    = 'radio';
    rb.name    = `victory-${uid}`;
    rb.value   = val;
    rb.checked = victoryCondition === val;
    lbl.appendChild(rb);
    lbl.appendChild(document.createTextNode(' ' + text));
    radioWrap.appendChild(lbl);
  });

  li.appendChild(row);
  li.appendChild(radioWrap);
  subtaskInputs.appendChild(li);

  if (!value) input.focus();
}

function saveTask() {
  const title = inputTitle.value.trim();
  if (!title) {
    titleError.classList.add('show');
    inputTitle.focus();
    return;
  }
  titleError.classList.remove('show');

  const description  = inputDesc.value.trim();
  const recurrence   = document.querySelector('input[name="recurrence"]:checked')?.value || 'none';
  const subtasksFromForm = [...subtaskInputs.querySelectorAll('li.subtask-input-item')]
    .map(li => ({
      text: li.querySelector('input[type="text"]').value.trim(),
      victoryCondition: li.querySelector('input[type="radio"]:checked')?.value || ''
    }))
    .filter(s => s.text);

  if (editingId) {
    const todo = todos.find(t => t.id === editingId);
    if (todo) {
      todo.title       = title;
      todo.description = description;
      todo.recurrence  = recurrence;

      // Preserve done state for subtasks with the same text; update victoryCondition
      const existingByText = {};
      (todo.subtasks || []).forEach(s => { existingByText[s.text] = s; });

      todo.subtasks = subtasksFromForm.map(({ text, victoryCondition }) => {
        const existing = existingByText[text];
        return existing
          ? { ...existing, victoryCondition }
          : { id: generateId(), text, victoryCondition, done: false };
      });
    }
  } else {
    const now = Date.now();
    todos.push({
      id:          generateId(),
      title,
      description,
      recurrence,
      lastResetAt: now,
      subtasks:    subtasksFromForm.map(({ text, victoryCondition }) =>
                     ({ id: generateId(), text, victoryCondition, done: false })
                   ),
      order:       todos.length,
      color:       '',
      createdAt:   now,
    });
  }

  saveTodos(todos);
  closeModal();
  renderCards();
}

// ════════════════════════════════════════
// Search
// ════════════════════════════════════════
function getAllUniqueSubtaskTexts() {
  const set = new Set();
  todos.forEach(t => (t.subtasks || []).forEach(s => { if (s.text) set.add(s.text); }));
  return [...set].sort();
}

function renderSearchBadges() {
  const container = document.getElementById('search-badges');
  container.innerHTML = '';
  selectedSubtasks.forEach(text => {
    const badge = document.createElement('span');
    badge.className = 'search-badge';
    badge.textContent = text;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-badge-remove';
    btn.textContent = '✕';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedSubtasks.delete(text);
      renderSearchBadges();
      renderDropdown();
      renderCards();
    });
    badge.appendChild(btn);
    container.appendChild(badge);
  });
}

function renderDropdown() {
  const input    = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');
  const q        = input.value.trim().toLowerCase();
  const texts    = getAllUniqueSubtaskTexts().filter(t => !q || t.toLowerCase().includes(q));

  dropdown.innerHTML = '';
  if (texts.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dropdown-empty';
    empty.textContent = '無符合的子任務';
    dropdown.appendChild(empty);
  } else {
    texts.forEach(text => {
      const li = document.createElement('li');
      li.className = 'dropdown-item' + (selectedSubtasks.has(text) ? ' selected' : '');

      const check = document.createElement('span');
      check.className = 'dropdown-check';
      check.textContent = '✓';

      li.appendChild(check);
      li.appendChild(document.createTextNode(text));

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (selectedSubtasks.has(text)) {
          selectedSubtasks.delete(text);
        } else {
          selectedSubtasks.add(text);
        }
        input.value = '';
        renderSearchBadges();
        renderDropdown();
        renderCards();
      });

      dropdown.appendChild(li);
    });
  }
}

// ── Search event bindings ──
const searchInput    = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-dropdown');

searchInput.addEventListener('focus', () => {
  renderDropdown();
  searchDropdown.hidden = false;
});

searchInput.addEventListener('input', () => {
  renderDropdown();
  searchDropdown.hidden = false;
});

searchInput.addEventListener('blur', () => {
  setTimeout(() => { searchDropdown.hidden = true; }, 150);
});

document.getElementById('search-container').addEventListener('click', () => {
  searchInput.focus();
});

// ── Event bindings ──
document.getElementById('btn-new-task')    .addEventListener('click', () => openModal());
document.getElementById('btn-add-subtask') .addEventListener('click', () => addSubtaskInput());
document.getElementById('btn-save')        .addEventListener('click', saveTask);
document.getElementById('btn-cancel')      .addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
});

inputTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveTask();
});

// Initial render
renderCards();
