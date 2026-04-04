# Sidebar Edit Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-field click-to-edit with a global edit mode toggle (pencil icon) in the sidebar, so all editable fields become inputs at once when edit mode is on.

**Architecture:** Single-file change to `Sidebar.jsx`. Swap `editingField` state for `isEditMode` boolean. All four fields (company, contactName, contactEmail, subject) render as `<input>` when `isEditMode` is true, plain text when false. sentDate becomes permanently read-only. Pencil button in header toggles the mode.

**Tech Stack:** React, Tailwind CSS, lucide-react

---

### Task 1: Replace `editingField` state with `isEditMode`, add Pencil import

**Files:**
- Modify: `web/src/components/Sidebar.jsx:1-12` (imports)
- Modify: `web/src/components/Sidebar.jsx:206-221` (state + reset effect)

**Step 1: Add `Pencil` to the lucide-react import**

There is no lucide-react import yet in `Sidebar.jsx`. Add one at line 12 (after the DateRangePicker import):

```js
import { Pencil } from 'lucide-react';
```

**Step 2: Replace `editingField` with `isEditMode` in state declarations**

Find this block (~line 206):
```js
  const [editingField, setEditingField] = useState(null);
  const [editValues, setEditValues] = useState({});
```

Replace with:
```js
  const [isEditMode, setIsEditMode] = useState(false);
  const [editValues, setEditValues] = useState({});
```

**Step 3: Update the record-open reset effect**

In the `useEffect` that resets state when `record` changes (dependency `[record?.threadId]`), find:
```js
      setEditingField(null);
      setEditValues({
        company:      record.company      || '',
        contactName:  record.contactName  || '',
        contactEmail: record.contactEmail || '',
        subject:      record.subject      || '',
        sentDate:     record.sentDate
          ? new Date(record.sentDate).toISOString().split('T')[0]
          : '',
      });
```

Replace with (remove `sentDate` from `editValues`, reset `isEditMode`):
```js
      setIsEditMode(false);
      setEditValues({
        company:      record.company      || '',
        contactName:  record.contactName  || '',
        contactEmail: record.contactEmail || '',
        subject:      record.subject      || '',
      });
```

**Step 4: Commit**

```bash
git -C /Users/aaron/Documents/GitHub/reach add web/src/components/Sidebar.jsx
git -C /Users/aaron/Documents/GitHub/reach commit -m "refactor(sidebar): replace editingField with isEditMode, add Pencil import"
```

---

### Task 2: Update `handleFieldBlur` and `handleFieldKeyDown` to remove sentDate

**Files:**
- Modify: `web/src/components/Sidebar.jsx` — `handleFieldBlur` and `handleFieldKeyDown`

**Step 1: Remove sentDate from `handleFieldBlur`**

Find `handleFieldBlur` (~line 307). It currently has a special branch for `sentDate`:
```js
  const handleFieldBlur = useCallback((field) => {
    const raw = editValues[field];
    const original = field === 'sentDate'
      ? (record?.sentDate ? new Date(record.sentDate).toISOString().split('T')[0] : '')
      : (record?.[field] || '');
    if (raw !== original) {
      const patch = field === 'sentDate'
        ? { sentDate: raw ? new Date(raw + 'T12:00:00.000Z').toISOString() : null }
        : { [field]: raw };
      onUpdateRecord(record.threadId, patch);
    }
    setEditingField(null);
  }, [record, editValues, onUpdateRecord]);
```

Replace with (no sentDate logic, remove `setEditingField` call):
```js
  const handleFieldBlur = useCallback((field) => {
    const raw = editValues[field];
    const original = record?.[field] || '';
    if (raw !== original) {
      onUpdateRecord(record.threadId, { [field]: raw });
    }
  }, [record, editValues, onUpdateRecord]);
```

**Step 2: Remove sentDate from `handleFieldKeyDown`**

Find `handleFieldKeyDown` (~line 321). It currently resets via `setEditingField(null)`:
```js
  const handleFieldKeyDown = useCallback((e, field) => {
    if (e.key === 'Enter') { e.target.blur(); return; }
    if (e.key === 'Escape') {
      const original = field === 'sentDate'
        ? (record?.sentDate ? new Date(record.sentDate).toISOString().split('T')[0] : '')
        : (record?.[field] || '');
      setEditValues(v => ({ ...v, [field]: original }));
      setEditingField(null);
      e.preventDefault();
      e.stopPropagation();
    }
  }, [record]);
```

Replace with (no sentDate branch, Escape restores value only):
```js
  const handleFieldKeyDown = useCallback((e, field) => {
    if (e.key === 'Enter') { e.target.blur(); return; }
    if (e.key === 'Escape') {
      setEditValues(v => ({ ...v, [field]: record?.[field] || '' }));
      e.preventDefault();
      e.stopPropagation();
    }
  }, [record]);
```

**Step 3: Commit**

```bash
git -C /Users/aaron/Documents/GitHub/reach add web/src/components/Sidebar.jsx
git -C /Users/aaron/Documents/GitHub/reach commit -m "refactor(sidebar): remove sentDate from field blur/keydown handlers"
```

---

### Task 3: Add pencil toggle button to sidebar header

**Files:**
- Modify: `web/src/components/Sidebar.jsx` — header action row

**Step 1: Find the header action button group**

In the header (inside `{record && (...)}`, inside the `confirmingDelete` else branch), find the `<div className="flex items-center gap-0.5 flex-shrink-0">` that contains the heart, archive, trash, divider, and close buttons.

**Step 2: Add the pencil button as the first button in that group**

Insert before the heart button:
```jsx
                  <button
                    onClick={() => setIsEditMode(v => !v)}
                    aria-label={isEditMode ? 'Exit edit mode' : 'Edit record'}
                    aria-pressed={isEditMode}
                    className={`p-2 rounded-lg transition-colors ${
                      isEditMode
                        ? 'text-accent bg-accent/10'
                        : 'text-chrome-muted hover:text-chrome-text hover:bg-black/5'
                    }`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
```

**Step 3: Commit**

```bash
git -C /Users/aaron/Documents/GitHub/reach add web/src/components/Sidebar.jsx
git -C /Users/aaron/Documents/GitHub/reach commit -m "feat(sidebar): add pencil toggle button to header"
```

---

### Task 4: Update header field rendering (company, contactName, contactEmail)

**Files:**
- Modify: `web/src/components/Sidebar.jsx` — header company/contact section (~lines 406–464)

**Step 1: Replace company field**

Find the current company block:
```jsx
                {editingField === 'company' ? (
                  <input
                    autoFocus
                    value={editValues.company}
                    onChange={e => setEditValues(v => ({ ...v, company: e.target.value }))}
                    onBlur={() => handleFieldBlur('company')}
                    onKeyDown={e => handleFieldKeyDown(e, 'company')}
                    className="font-semibold text-[16px] text-chrome-text leading-tight w-full bg-transparent border-b border-accent outline-none"
                  />
                ) : (
                  <p
                    className="font-semibold text-[16px] text-chrome-text leading-tight truncate cursor-text hover:underline decoration-dashed underline-offset-2"
                    onClick={() => setEditingField('company')}
                    title="Click to edit"
                  >
                    {record.company}
                  </p>
                )}
```

Replace with:
```jsx
                {isEditMode ? (
                  <input
                    value={editValues.company}
                    onChange={e => setEditValues(v => ({ ...v, company: e.target.value }))}
                    onBlur={() => handleFieldBlur('company')}
                    onKeyDown={e => handleFieldKeyDown(e, 'company')}
                    className="font-semibold text-[16px] text-chrome-text leading-tight w-full bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent"
                  />
                ) : (
                  <p className="font-semibold text-[16px] text-chrome-text leading-tight truncate">
                    {record.company}
                  </p>
                )}
```

**Step 2: Replace contactName field**

Find:
```jsx
                  {editingField === 'contactName' ? (
                    <input
                      autoFocus
                      value={editValues.contactName}
                      onChange={e => setEditValues(v => ({ ...v, contactName: e.target.value }))}
                      onBlur={() => handleFieldBlur('contactName')}
                      onKeyDown={e => handleFieldKeyDown(e, 'contactName')}
                      className="text-[13px] text-chrome-muted w-24 bg-transparent border-b border-accent outline-none"
                    />
                  ) : (
                    <span
                      className="text-[13px] text-chrome-muted truncate cursor-text hover:underline decoration-dashed underline-offset-2 shrink-0"
                      onClick={() => setEditingField('contactName')}
                      title="Click to edit"
                    >
                      {record.contactName || <span className="opacity-40">Name</span>}
                    </span>
                  )}
```

Replace with:
```jsx
                  {isEditMode ? (
                    <input
                      value={editValues.contactName}
                      onChange={e => setEditValues(v => ({ ...v, contactName: e.target.value }))}
                      onBlur={() => handleFieldBlur('contactName')}
                      onKeyDown={e => handleFieldKeyDown(e, 'contactName')}
                      placeholder="Name"
                      className="text-[13px] text-chrome-muted w-24 bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent"
                    />
                  ) : (
                    <span className="text-[13px] text-chrome-muted truncate shrink-0">
                      {record.contactName || <span className="opacity-40">Name</span>}
                    </span>
                  )}
```

**Step 3: Replace contactEmail field**

Find:
```jsx
                  {editingField === 'contactEmail' ? (
                    <input
                      autoFocus
                      type="email"
                      value={editValues.contactEmail}
                      onChange={e => setEditValues(v => ({ ...v, contactEmail: e.target.value }))}
                      onBlur={() => handleFieldBlur('contactEmail')}
                      onKeyDown={e => handleFieldKeyDown(e, 'contactEmail')}
                      className="text-[13px] text-chrome-muted flex-1 bg-transparent border-b border-accent outline-none"
                    />
                  ) : (
                    <span
                      className="text-[13px] text-chrome-muted truncate cursor-text hover:underline decoration-dashed underline-offset-2"
                      onClick={() => setEditingField('contactEmail')}
                      title="Click to edit"
                    >
                      {record.contactEmail || <span className="opacity-40">Email</span>}
                    </span>
                  )}
```

Replace with:
```jsx
                  {isEditMode ? (
                    <input
                      type="email"
                      value={editValues.contactEmail}
                      onChange={e => setEditValues(v => ({ ...v, contactEmail: e.target.value }))}
                      onBlur={() => handleFieldBlur('contactEmail')}
                      onKeyDown={e => handleFieldKeyDown(e, 'contactEmail')}
                      placeholder="Email"
                      className="text-[13px] text-chrome-muted flex-1 bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent"
                    />
                  ) : (
                    <span className="text-[13px] text-chrome-muted truncate">
                      {record.contactEmail || <span className="opacity-40">Email</span>}
                    </span>
                  )}
```

**Step 4: Commit**

```bash
git -C /Users/aaron/Documents/GitHub/reach add web/src/components/Sidebar.jsx
git -C /Users/aaron/Documents/GitHub/reach commit -m "feat(sidebar): render company/contact fields as inputs in edit mode"
```

---

### Task 5: Update subject field and make sentDate permanently read-only

**Files:**
- Modify: `web/src/components/Sidebar.jsx` — left column body (~lines 532–575)

**Step 1: Replace subject field**

Find:
```jsx
                  {editingField === 'subject' ? (
                    <input
                      autoFocus
                      value={editValues.subject}
                      onChange={e => setEditValues(v => ({ ...v, subject: e.target.value }))}
                      onBlur={() => handleFieldBlur('subject')}
                      onKeyDown={e => handleFieldKeyDown(e, 'subject')}
                      className="font-semibold text-sm text-chrome-text w-full bg-transparent border-b border-accent outline-none leading-snug"
                    />
                  ) : (
                    <h3
                      className="font-semibold text-sm text-chrome-text leading-snug cursor-text hover:underline decoration-dashed underline-offset-2"
                      onClick={() => setEditingField('subject')}
                      title="Click to edit"
                    >
                      {record.subject}
                    </h3>
                  )}
```

Replace with:
```jsx
                  {isEditMode ? (
                    <input
                      value={editValues.subject}
                      onChange={e => setEditValues(v => ({ ...v, subject: e.target.value }))}
                      onBlur={() => handleFieldBlur('subject')}
                      onKeyDown={e => handleFieldKeyDown(e, 'subject')}
                      className="font-semibold text-sm text-chrome-text w-full bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent leading-snug"
                    />
                  ) : (
                    <h3 className="font-semibold text-sm text-chrome-text leading-snug">
                      {record.subject}
                    </h3>
                  )}
```

**Step 2: Make sentDate permanently read-only**

Find the sentDate section:
```jsx
                      {editingField === 'sentDate' ? (
                        <input
                          autoFocus
                          type="date"
                          value={editValues.sentDate}
                          onChange={e => setEditValues(v => ({ ...v, sentDate: e.target.value }))}
                          onBlur={() => handleFieldBlur('sentDate')}
                          onKeyDown={e => handleFieldKeyDown(e, 'sentDate')}
                          className="text-xs text-chrome-text bg-transparent border-b border-accent outline-none"
                        />
                      ) : (
                        <span
                          className="cursor-text hover:underline decoration-dashed underline-offset-2"
                          onClick={() => setEditingField('sentDate')}
                          title="Click to edit"
                        >
                          {formatShortDate(record.sentDate)}
                        </span>
                      )}
```

Replace with (plain text, always):
```jsx
                      <span>{formatShortDate(record.sentDate)}</span>
```

**Step 3: Commit**

```bash
git -C /Users/aaron/Documents/GitHub/reach add web/src/components/Sidebar.jsx
git -C /Users/aaron/Documents/GitHub/reach commit -m "feat(sidebar): subject uses edit mode toggle, sentDate is read-only"
```

---

### Task 6: Visual verification

**Step 1: Start dev server**

```bash
cd /Users/aaron/Documents/GitHub/reach/web && npm run dev
```

**Step 2: Verify the following in the browser**

- [ ] Opening the sidebar shows no edit borders and no hover underlines on any field
- [ ] Clicking the pencil icon highlights it (accent color) and all four fields (company, contact name, contact email, subject) become visible inputs with borders
- [ ] Clicking pencil again returns to plain text view
- [ ] Editing a field and tabbing/blurring away saves the value (check network or UI update)
- [ ] Escape key inside an input restores the original value
- [ ] The sent date is always plain text — never becomes an input
- [ ] Opening a different card resets edit mode to off

**Step 3: Stop dev server (Ctrl+C)**
