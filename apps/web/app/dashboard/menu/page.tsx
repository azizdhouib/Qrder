"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  tags: string[];
  priceCents: number;
  isActive: boolean;
  options: { id: string; name: string; priceDeltaCents: number }[];
};

type Category = {
  id: string;
  name: string;
  isActive: boolean;
  position?: number;
  items: MenuItem[];
};

type ItemDraft = {
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string;
  tags: string;
  priceCents: number;
  isActive: boolean;
  options: OptionDraftRow[];
};

type ItemModalState = {
  mode: "create" | "edit";
  itemId?: string;
  draft: ItemDraft;
};

type OptionDraftRow = { key: string; name: string; priceDeltaCents: number };

type ConfigTab = "identity" | "categories" | "dishes" | "setmenus";

const TAG_PRESETS = ["Végétarien", "Vegan", "Épicé", "Maison", "Sans gluten"];

function tagsFromInput(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function toggleSuggestedTag(current: string, tag: string): string {
  const parts = tagsFromInput(current);
  const lower = tag.toLowerCase();
  const idx = parts.findIndex((p) => p.toLowerCase() === lower);
  if (idx >= 0) return parts.filter((_, i) => i !== idx).join(", ");
  return [...parts, tag].join(", ");
}

function tagsListIncludesTag(tagsCsv: string, tag: string): boolean {
  const lower = tag.toLowerCase();
  return tagsFromInput(tagsCsv).some((p) => p.toLowerCase() === lower);
}

function newOptionRowKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function optionsPayloadFromDraft(rows: OptionDraftRow[]): { name: string; priceDeltaCents: number }[] {
  return rows
    .map((r) => ({ name: r.name.trim(), priceDeltaCents: r.priceDeltaCents }))
    .filter((r) => r.name.length > 0);
}

function emptyDraft(categoryId: string): ItemDraft {
  return {
    categoryId,
    name: "",
    description: "",
    imageUrl: "",
    tags: "",
    priceCents: 1000,
    isActive: true,
    options: []
  };
}

export default function MenuPage() {
  return <TokenGate>{(token) => <MenuManager token={token} />}</TokenGate>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de lire l'image"));
    reader.readAsDataURL(file);
  });
}

function MenuManager({ token }: { token: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [configTab, setConfigTab] = useState<ConfigTab>("dishes");
  const [me, setMe] = useState<{ restaurant: { name: string; slug: string; suspended: boolean } } | null>(
    null
  );

  const [categoryName, setCategoryName] = useState("");
  const [categoryTabQuery, setCategoryTabQuery] = useState("");
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [itemModalMounted, setItemModalMounted] = useState(false);

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, "fr")
      ),
    [categories]
  );

  const filteredCategoriesForTab = useMemo(() => {
    const q = categoryTabQuery.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedCategories, categoryTabQuery]);

  async function load() {
    const result = await apiFetch<Category[]>("/menu/full?includeInactive=true", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setCategories(result);
  }

  async function loadMe() {
    try {
      const r = await apiFetch<{ restaurant: { name: string; slug: string; suspended: boolean } }>("/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMe(r);
    } catch {
      setMe(null);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    loadMe().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setItemModalMounted(true);
  }, []);

  const closeItemModal = useCallback(() => setItemModal(null), []);

  useEffect(() => {
    if (!itemModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeItemModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemModal, closeItemModal]);

  useEffect(() => {
    if (!itemModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [itemModal]);

  async function deleteCategory(cat: Category) {
    const message =
      cat.items.length > 0
        ? `Supprimer la catégorie « ${cat.name} » ? Si des commandes existent encore, elle sera désactivée et ses produits masqués.`
        : `Supprimer la catégorie « ${cat.name} » ?`;
    if (!window.confirm(message)) return;

    await apiFetch(`/menu/categories/${cat.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    await load();
  }

  async function toggleCategoryActive(cat: Category) {
    await apiFetch(`/menu/categories/${cat.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !cat.isActive })
    });
    await load();
  }

  /** Réécrit les positions 0…n−1 pour toute la liste (évite les doublons en base si plusieurs catégories avaient position 0). */
  async function persistCategoryOrder(ordered: Category[]) {
    await Promise.all(
      ordered.map((c, i) =>
        apiFetch(`/menu/categories/${c.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ position: i })
        })
      )
    );
  }

  async function moveCategory(catId: string, delta: -1 | 1) {
    const ordered = [...sortedCategories];
    const idx = ordered.findIndex((c) => c.id === catId);
    const j = idx + delta;
    if (idx < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[idx], next[j]] = [next[j], next[idx]];
    const reindexed = next.map((c, i) => ({ ...c, position: i }));
    const previous = categories;
    setCategories(reindexed);
    try {
      await persistCategoryOrder(reindexed);
    } catch (e) {
      console.error(e);
      setCategories(previous);
      window.alert("Impossible de réordonner les catégories. Réessaie.");
    }
  }

  async function saveCategoryRename(catId: string) {
    const name = renameDraft.trim();
    if (!name) {
      setRenamingCategoryId(null);
      setRenameDraft("");
      return;
    }
    await apiFetch(`/menu/categories/${catId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
    setRenamingCategoryId(null);
    setRenameDraft("");
    await load();
  }

  function findCategoryIdForItem(itemId: string): string {
    for (const c of categories) {
      if (c.items.some((i) => i.id === itemId)) return c.id;
    }
    return sortedCategories[0]?.id ?? "";
  }

  function openCreateItem() {
    const cid = sortedCategories[0]?.id ?? "";
    setItemModal({ mode: "create", draft: emptyDraft(cid) });
  }

  function openEditItem(item: MenuItem) {
    setItemModal({
      mode: "edit",
      itemId: item.id,
      draft: {
        categoryId: findCategoryIdForItem(item.id),
        name: item.name,
        description: item.description ?? "",
        imageUrl: item.imageUrl ?? "",
        tags: (item.tags ?? []).join(", "),
        priceCents: item.priceCents,
        isActive: item.isActive,
        options: item.options.map((o) => ({
          key: o.id,
          name: o.name,
          priceDeltaCents: o.priceDeltaCents
        }))
      }
    });
  }

  async function saveItemModal() {
    if (!itemModal) return;
    const { mode, itemId, draft } = itemModal;
    if (!draft.name.trim() || !draft.categoryId) return;

    try {
      if (mode === "create") {
        await apiFetch("/menu/items", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            categoryId: draft.categoryId,
            name: draft.name.trim(),
            description: draft.description.trim() || undefined,
            imageUrl: draft.imageUrl.trim() || null,
            tags: tagsFromInput(draft.tags),
            priceCents: draft.priceCents,
            isActive: draft.isActive,
            options: optionsPayloadFromDraft(draft.options)
          })
        });
      } else if (itemId) {
        await apiFetch(`/menu/items/${itemId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim() || null,
            imageUrl: draft.imageUrl.trim() || null,
            tags: tagsFromInput(draft.tags),
            priceCents: draft.priceCents,
            isActive: draft.isActive,
            categoryId: draft.categoryId,
            options: optionsPayloadFromDraft(draft.options)
          })
        });
      }
      closeItemModal();
      await load();
    } catch (e) {
      console.error(e);
      window.alert(
        "Enregistrement impossible (vérifie la connexion ou les champs). Si le problème continue, ouvre la console du navigateur pour le détail."
      );
    }
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm("Supprimer ce plat ?")) return;
    await apiFetch(`/menu/items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (itemModal?.itemId === itemId) closeItemModal();
    await load();
  }

  async function toggleItemActive(item: MenuItem) {
    const nextActive = !item.isActive;
    const previous = categories;
    setCategories((cats) =>
      cats.map((cat) => ({
        ...cat,
        items: cat.items.map((it) => (it.id === item.id ? { ...it, isActive: nextActive } : it))
      }))
    );
    setItemModal((m) =>
      m?.itemId === item.id ? { ...m, draft: { ...m.draft, isActive: nextActive } } : m
    );
    try {
      await apiFetch(`/menu/items/${item.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: nextActive })
      });
    } catch (e) {
      console.error(e);
      setCategories(previous);
      setItemModal((m) =>
        m?.itemId === item.id ? { ...m, draft: { ...m.draft, isActive: item.isActive } } : m
      );
      window.alert("Impossible de mettre à jour la visibilité. Réessaie.");
    }
  }

  async function onModalImageFile(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setItemModal((m) => (m ? { ...m, draft: { ...m.draft, imageUrl: dataUrl } } : m));
  }

  async function openClientPreview() {
    if (!me) {
      window.open(`${window.location.origin}/dashboard/tables`, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const tables = await apiFetch<{ id: string; qrToken: string; name: string }[]>("/tables", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const t = tables[0];
      if (!t) {
        window.open(`${window.location.origin}/dashboard/tables`, "_blank", "noopener,noreferrer");
        return;
      }
      window.open(
        `${window.location.origin}/r/${me.restaurant.slug}/t/${t.qrToken}`,
        "_blank",
        "noopener,noreferrer"
      );
    } catch {
      window.open(`${window.location.origin}/dashboard/tables`, "_blank", "noopener,noreferrer");
    }
  }

  function patchDraft(patch: Partial<ItemDraft>) {
    setItemModal((m) => (m ? { ...m, draft: { ...m.draft, ...patch } } : m));
  }

  const itemModalPortal =
    itemModalMounted && itemModal && typeof document !== "undefined"
      ? createPortal(
          <div className="menu-edit-modal-root" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
            <button type="button" className="menu-edit-modal-backdrop" onClick={closeItemModal} aria-label="Fermer" />
            <div className="menu-edit-modal-panel menu-item-form-modal">
              <div className="menu-edit-modal-head">
                <h2 id="item-modal-title" className="menu-edit-modal-title">
                  {itemModal.mode === "create" ? "Nouveau plat" : "Modifier le plat"}
                </h2>
                <button type="button" className="menu-edit-modal-close" onClick={closeItemModal} aria-label="Fermer">
                  ×
                </button>
              </div>

              <div className="menu-item-form-body">
                <div className="menu-item-form-section">
                  <span className="menu-item-form-kicker">Photo</span>
                  <div className="menu-item-form-photo-row">
                    <div className="menu-item-form-thumb-wrap">
                      {itemModal.draft.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={itemModal.draft.imageUrl} alt="" className="menu-item-form-thumb" />
                      ) : (
                        <div className="menu-item-form-thumb-placeholder">
                          <ImageIcon className="menu-item-form-thumb-icon" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="menu-item-form-photo-actions">
                      <label className="menu-item-form-import-btn">
                        Importer
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => onModalImageFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <input
                        className="menu-item-form-url-input"
                        value={itemModal.draft.imageUrl}
                        onChange={(e) => patchDraft({ imageUrl: e.target.value })}
                        placeholder="URL de l’image"
                      />
                    </div>
                  </div>
                </div>

                <div className="menu-item-form-section">
                  <span className="menu-item-form-kicker">Nom</span>
                  <input
                    className="menu-item-form-input"
                    value={itemModal.draft.name}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                    placeholder="Nom du plat"
                  />
                </div>

                <div className="menu-item-form-section">
                  <span className="menu-item-form-kicker">Description</span>
                  <textarea
                    className="menu-item-form-textarea"
                    rows={4}
                    value={itemModal.draft.description}
                    onChange={(e) => patchDraft({ description: e.target.value })}
                    placeholder="Décrire le plat…"
                  />
                </div>

                <div className="menu-item-form-section menu-item-form-two-col">
                  <div>
                    <span className="menu-item-form-kicker">Prix (€)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="menu-item-form-input"
                      value={itemModal.draft.priceCents / 100}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        patchDraft({ priceCents: Number.isFinite(v) ? Math.round(v * 100) : 0 });
                      }}
                    />
                  </div>
                  <div>
                    <span className="menu-item-form-kicker">Catégorie</span>
                    <select
                      className="menu-item-form-input menu-item-form-select"
                      value={itemModal.draft.categoryId}
                      onChange={(e) => patchDraft({ categoryId: e.target.value })}
                    >
                      {sortedCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="menu-item-form-section">
                  <span className="menu-item-form-kicker">Tags</span>
                  <div className="menu-item-form-tag-grid">
                    {TAG_PRESETS.map((tag) => {
                      const on = tagsListIncludesTag(itemModal.draft.tags, tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`menu-item-form-tag ${on ? "menu-item-form-tag-on" : ""}`}
                          onClick={() =>
                            setItemModal((m) => {
                              if (!m) return m;
                              return {
                                ...m,
                                draft: {
                                  ...m.draft,
                                  tags: toggleSuggestedTag(m.draft.tags, tag)
                                }
                              };
                            })
                          }
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    className="menu-item-form-input"
                    style={{ marginTop: 10 }}
                    value={itemModal.draft.tags}
                    onChange={(e) => patchDraft({ tags: e.target.value })}
                    placeholder="Autres tags, séparés par des virgules"
                  />
                </div>

                <div className="menu-item-form-section">
                  <span className="menu-item-form-kicker">Options (suppléments)</span>
                  <p className="menu-item-form-hint">
                    Le client peut en cocher plusieurs à l’ajout au panier. Laisser vide si aucune option.
                  </p>
                  <div className="menu-item-form-option-list">
                    {itemModal.draft.options.map((row) => (
                      <div key={row.key} className="menu-item-form-option-row">
                        <input
                          className="menu-item-form-input"
                          value={row.name}
                          onChange={(e) =>
                            setItemModal((m) =>
                              m
                                ? {
                                    ...m,
                                    draft: {
                                      ...m.draft,
                                      options: m.draft.options.map((o) =>
                                        o.key === row.key ? { ...o, name: e.target.value } : o
                                      )
                                    }
                                  }
                                : m
                            )
                          }
                          placeholder="Ex. Bacon"
                        />
                        <label className="menu-item-form-option-price">
                          +€
                          <input
                            type="number"
                            step="0.01"
                            value={row.priceDeltaCents / 100}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setItemModal((m) =>
                                m
                                  ? {
                                      ...m,
                                      draft: {
                                        ...m.draft,
                                        options: m.draft.options.map((o) =>
                                          o.key === row.key
                                            ? {
                                                ...o,
                                                priceDeltaCents: Number.isFinite(v) ? Math.round(v * 100) : 0
                                              }
                                            : o
                                        )
                                      }
                                    }
                                  : m
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="menu-item-form-option-remove"
                          onClick={() =>
                            setItemModal((m) =>
                              m
                                ? {
                                    ...m,
                                    draft: {
                                      ...m.draft,
                                      options: m.draft.options.filter((o) => o.key !== row.key)
                                    }
                                  }
                                : m
                            )
                          }
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="menu-item-form-add-option"
                    onClick={() =>
                      setItemModal((m) =>
                        m
                          ? {
                              ...m,
                              draft: {
                                ...m.draft,
                                options: [...m.draft.options, { key: newOptionRowKey(), name: "", priceDeltaCents: 0 }]
                              }
                            }
                          : m
                      )
                    }
                  >
                    + Ajouter une option
                  </button>
                </div>

                <div className="menu-item-form-section menu-item-form-avail">
                  <label className="menu-item-form-check">
                    <input
                      type="checkbox"
                      checked={itemModal.draft.isActive}
                      onChange={(e) => patchDraft({ isActive: e.target.checked })}
                    />
                    <span>Disponible à la vente</span>
                  </label>
                </div>
              </div>

              <div className="menu-edit-modal-foot menu-item-form-foot">
                <button type="button" className="menu-item-form-btn-secondary" onClick={closeItemModal}>
                  Annuler
                </button>
                <button type="button" className="menu-item-form-btn-primary" onClick={() => void saveItemModal()}>
                  Enregistrer
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <main className="menu-config-page">
      <header className="menu-config-header">
        <div className="menu-config-header-text">
          <p className="menu-config-kicker">Configuration</p>
          <h1 className="menu-config-title">Ma carte</h1>
          <p className="menu-config-sub">Tout ce que les clients voient en scannant le QR.</p>
        </div>
        <button type="button" className="menu-config-preview-btn" onClick={() => void openClientPreview()}>
          Aperçu client
        </button>
      </header>

      <nav className="menu-config-tabs" role="tablist" aria-label="Sections de la carte">
        {(
          [
            ["identity", "Identité"],
            ["categories", "Catégories"],
            ["dishes", "Plats"],
            ["setmenus", "Formules"]
          ] as const
        ).map(([id, label]) => {
          const selected = configTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`menu-tab-${id}`}
              className={`menu-config-tab ${selected ? "menu-config-tab-active" : ""}`}
              onClick={() => setConfigTab(id)}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {configTab === "identity" && (
        <section className="menu-config-card">
          <h2 className="menu-config-card-title">Identité du lieu</h2>
          {me ? (
            <dl className="menu-config-dl">
              <dt>Nom affiché</dt>
              <dd>{me.restaurant.name}</dd>
              <dt>URL publique</dt>
              <dd className="menu-config-mono">/r/{me.restaurant.slug}/…</dd>
              {me.restaurant.suspended ? (
                <p className="menu-config-warn">Ce restaurant est marqué comme suspendu côté plateforme.</p>
              ) : null}
            </dl>
          ) : (
            <p className="menu-config-muted">Chargement du profil…</p>
          )}
          <p className="menu-config-muted" style={{ marginTop: "1rem" }}>
            Le nom du restaurant est géré par l’administrateur. Contacte le support pour le modifier.
          </p>
        </section>
      )}

      {configTab === "categories" && (
        <section className="menu-config-card">
          <div className="menu-config-toolbar">
            <input
              type="search"
              className="menu-config-search"
              value={categoryTabQuery}
              onChange={(e) => setCategoryTabQuery(e.target.value)}
              placeholder="Ex. Boissons, Cocktails, Vins…"
            />
            <div className="menu-config-toolbar-right">
              <input
                className="menu-config-search menu-config-search-compact"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Nouvelle catégorie"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void (async () => {
                      if (!categoryName.trim()) return;
                      await apiFetch("/menu/categories", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ name: categoryName.trim() })
                      });
                      setCategoryName("");
                      await load();
                    })();
                  }
                }}
              />
              <button
                type="button"
                className="menu-config-btn-primary"
                onClick={async () => {
                  if (!categoryName.trim()) return;
                  await apiFetch("/menu/categories", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ name: categoryName.trim() })
                  });
                  setCategoryName("");
                  await load();
                }}
              >
                + Ajouter
              </button>
            </div>
          </div>

          <ul className="menu-config-cat-list">
            {filteredCategoriesForTab.map((cat) => {
              const sortedIdx = sortedCategories.findIndex((c) => c.id === cat.id);
              const invalid = sortedIdx < 0;
              const atTop = invalid || sortedIdx === 0;
              const atBottom = invalid || sortedIdx >= sortedCategories.length - 1;
              const visible = cat.items.filter((i) => i.isActive).length;
              const total = cat.items.length;
              const countLabel =
                total === 0
                  ? "0 plat"
                  : visible === total
                    ? `${total} plat${total > 1 ? "s" : ""}`
                    : `${visible}/${total} plats visibles`;
              return (
                <li key={cat.id} className="menu-config-cat-row">
                  <div className="menu-config-cat-reorder">
                    <button
                      type="button"
                      className="menu-config-icon-btn"
                      aria-label="Monter"
                      disabled={atTop}
                      title={atTop ? "Déjà en tête de liste" : "Monter"}
                      onClick={() => void moveCategory(cat.id, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="menu-config-icon-btn"
                      aria-label="Descendre"
                      disabled={atBottom}
                      title={atBottom ? "Déjà en bas de liste" : "Descendre"}
                      onClick={() => void moveCategory(cat.id, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="menu-config-cat-main">
                    {renamingCategoryId === cat.id ? (
                      <input
                        className="menu-config-cat-rename-input"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          if (renameDraft.trim() === cat.name) {
                            setRenamingCategoryId(null);
                            setRenameDraft("");
                            return;
                          }
                          void saveCategoryRename(cat.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveCategoryRename(cat.id);
                          if (e.key === "Escape") {
                            setRenamingCategoryId(null);
                            setRenameDraft("");
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="menu-config-cat-name">{cat.name}</span>
                        {!cat.isActive ? (
                          <span className="menu-config-cat-badge">Masquée</span>
                        ) : null}
                      </>
                    )}
                  </div>
                  <span className="menu-config-cat-count">{countLabel}</span>
                  <div className="menu-config-cat-actions">
                    <button
                      type="button"
                      className="menu-config-icon-btn"
                      aria-label="Renommer"
                      onClick={() => {
                        setRenamingCategoryId(cat.id);
                        setRenameDraft(cat.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="menu-config-icon-btn"
                      aria-label={cat.isActive ? "Désactiver la catégorie" : "Réactiver"}
                      onClick={() => void toggleCategoryActive(cat)}
                    >
                      {cat.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-amber-500" />}
                    </button>
                    <button
                      type="button"
                      className="menu-config-icon-btn menu-config-icon-danger"
                      aria-label="Supprimer la catégorie"
                      onClick={() => void deleteCategory(cat)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {filteredCategoriesForTab.length === 0 ? (
            <p className="menu-config-muted" style={{ padding: "1rem 0" }}>
              Aucune catégorie ne correspond à ta recherche.
            </p>
          ) : null}
        </section>
      )}

      {configTab === "dishes" && (
        <>
          <div className="menu-config-dishes-toolbar">
            <button type="button" className="menu-config-btn-primary" onClick={openCreateItem}>
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Nouveau plat
            </button>
          </div>

          {sortedCategories.length === 0 ? (
            <section className="menu-config-card">
              <p className="menu-config-muted">Crée d’abord une catégorie dans l’onglet « Catégories ».</p>
            </section>
          ) : (
            sortedCategories.map((cat) => (
              <section key={cat.id} className="menu-config-dish-block">
                <h2 className="menu-config-dish-block-title">{cat.name}</h2>
                <div className="menu-config-dish-list">
                  {cat.items.length === 0 ? (
                    <p className="menu-config-muted menu-config-dish-empty">Aucun plat dans cette catégorie.</p>
                  ) : (
                    cat.items.map((item) => (
                      <div
                        key={item.id}
                        className={`menu-config-dish-row ${item.isActive ? "" : "menu-config-dish-row-muted"}`}
                      >
                        <div className="menu-config-dish-thumb">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt="" />
                          ) : (
                            <ImageIcon className="h-6 w-6 opacity-40" aria-hidden />
                          )}
                        </div>
                        <div className="menu-config-dish-info">
                          <p className="menu-config-dish-name">{item.name}</p>
                          <p className="menu-config-dish-desc">
                            {item.description?.trim() || "Pas de description"}
                          </p>
                        </div>
                        <div className="menu-config-dish-meta">
                          <span className="menu-config-dish-price">{(item.priceCents / 100).toFixed(0)}€</span>
                          <div className="menu-config-dish-icons">
                            <button
                              type="button"
                              className="menu-config-icon-btn"
                              aria-label={item.isActive ? "Masquer du menu" : "Afficher sur le menu"}
                              onClick={() => void toggleItemActive(item)}
                            >
                              {item.isActive ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4 text-red-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              className="menu-config-icon-btn"
                              aria-label="Modifier"
                              onClick={() => openEditItem(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="menu-config-icon-btn menu-config-icon-danger"
                              aria-label="Supprimer"
                              onClick={() => void deleteItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {configTab === "setmenus" && (
        <section className="menu-config-card">
          <h2 className="menu-config-card-title">Formules</h2>
          <p className="menu-config-muted">
            Les menus (entrée + plat + dessert, etc.) arriveront prochainement. Pour l’instant, compose ta carte avec
            des plats et des options.
          </p>
        </section>
      )}

      {itemModalPortal}
    </main>
  );
}
