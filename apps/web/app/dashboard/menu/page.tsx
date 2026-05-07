"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  priceCents: number;
  isActive: boolean;
  options: { id: string; name: string; priceDeltaCents: number }[];
};

type Category = {
  id: string;
  name: string;
  isActive: boolean;
  items: MenuItem[];
};

type EditDraft = {
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  isActive: boolean;
};

export default function MenuPage() {
  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Menu</span>
        <h1 className="hero-title">Gestion du menu</h1>
        <p className="hero-subtitle">
          Crée et organise catégories, produits, prix et options.
        </p>
      </section>
      <TokenGate>{(token) => <MenuManager token={token} />}</TokenGate>
    </main>
  );
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
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [priceCents, setPriceCents] = useState(1000);
  const [categoryId, setCategoryId] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemImageUrl, setItemImageUrl] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  async function load() {
    const result = await apiFetch<Category[]>("/menu/full?includeInactive=true", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setCategories(result);
    if (!activeCategoryId && result[0]) setActiveCategoryId(result[0].id);
    if (!categoryId && result[0]) setCategoryId(result[0].id);
  }

  async function deleteCategory(cat: Category) {
    const message =
      cat.items.length > 0
        ? `Supprimer la catégorie "${cat.name}" ? Si des commandes existent encore, elle sera désactivée et ses produits masqués.`
        : `Supprimer la catégorie "${cat.name}" ?`;
    if (!window.confirm(message)) return;

    await apiFetch(`/menu/categories/${cat.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (activeCategoryId === cat.id) setActiveCategoryId("");
    if (categoryId === cat.id) setCategoryId("");
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

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(item: MenuItem) {
    setEditingItemId(item.id);
    setEditDraft({
      name: item.name,
      description: item.description ?? "",
      imageUrl: item.imageUrl ?? "",
      priceCents: item.priceCents,
      isActive: item.isActive
    });
  }

  async function saveEdit(itemId: string) {
    if (!editDraft) return;
    await apiFetch(`/menu/items/${itemId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editDraft.name,
        description: editDraft.description || null,
        imageUrl: editDraft.imageUrl || null,
        priceCents: editDraft.priceCents,
        isActive: editDraft.isActive
      })
    });
    setEditingItemId(null);
    setEditDraft(null);
    await load();
  }

  async function deleteItem(itemId: string) {
    await apiFetch(`/menu/items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (editingItemId === itemId) {
      setEditingItemId(null);
      setEditDraft(null);
    }
    await load();
  }

  async function onCreateImageFile(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setItemImageUrl(dataUrl);
  }

  async function onEditImageFile(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setEditDraft((prev) => (prev ? { ...prev, imageUrl: dataUrl } : prev));
  }

  const activeCategory = useMemo(
    () => categories.find((cat) => cat.id === activeCategoryId) ?? categories[0],
    [categories, activeCategoryId]
  );

  return (
    <div className="stack">
      <section className="panel">
        <div className="row-between" style={{ flexWrap: "wrap" }}>
          <div>
            <h3 className="panel-title" style={{ marginBottom: 4 }}>
              Mon menu
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              {categories.length} catégories - sélectionne une catégorie pour gérer ses produits.
            </p>
          </div>
          <div className="row">
            <button className="btn-secondary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Fermer" : "Nouveau produit"}
            </button>
          </div>
        </div>

        <div className="menu-tabs">
          {categories.map((cat) => {
            const isActive = cat.id === activeCategory?.id;
            const visibleCount = cat.items.filter((it) => it.isActive).length;
            const totalCount = cat.items.length;
            return (
              <button
                key={cat.id}
                className={`menu-tab ${isActive ? "menu-tab-active" : ""} ${
                  cat.isActive ? "" : "menu-tab-inactive"
                }`}
                onClick={() => setActiveCategoryId(cat.id)}
                title={cat.isActive ? "" : "Catégorie désactivée"}
              >
                <span>{cat.name}</span>
                <span className="menu-tab-count">
                  {visibleCount}
                  {totalCount !== visibleCount ? `/${totalCount}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {showCreate && (
        <section className="panel">
          <h3 className="panel-title">Créer un produit</h3>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Catégorie</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sélectionner</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span className="form-label">Nom</span>
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Ex: Burger maison"
              />
            </label>

            <label className="form-field">
              <span className="form-label">Prix (en centimes)</span>
              <input
                type="number"
                value={priceCents}
                onChange={(e) => setPriceCents(Number(e.target.value))}
              />
            </label>

            <label className="form-field form-field-wide">
              <span className="form-label">Description</span>
              <input
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Description du produit"
              />
            </label>

            <label className="form-field form-field-wide">
              <span className="form-label">Image (URL ou upload)</span>
              <input
                value={itemImageUrl}
                onChange={(e) => setItemImageUrl(e.target.value)}
                placeholder="https://..."
              />
              <div style={{ height: 6 }} />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onCreateImageFile(e.target.files?.[0] ?? null)}
              />
              {itemImageUrl && (
                <div style={{ marginTop: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemImageUrl} alt="Preview" className="menu-thumb" />
                </div>
              )}
            </label>
          </div>

          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button
              className="btn-secondary"
              onClick={() => {
                setItemName("");
                setItemDescription("");
                setItemImageUrl("");
              }}
            >
              Réinitialiser
            </button>
            <button
              onClick={async () => {
                if (!categoryId || !itemName) return;
                await apiFetch("/menu/items", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` },
                  body: JSON.stringify({
                    categoryId,
                    name: itemName,
                    description: itemDescription,
                    imageUrl: itemImageUrl || null,
                    priceCents,
                    options: []
                  })
                });
                setItemName("");
                setItemDescription("");
                setItemImageUrl("");
                setShowCreate(false);
                await load();
              }}
            >
              Ajouter
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Nouvelle catégorie
          </h3>
        </div>
        <div className="row">
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Nom de la catégorie"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            onClick={async () => {
              if (!categoryName) return;
              await apiFetch("/menu/categories", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: categoryName })
              });
              setCategoryName("");
              await load();
            }}
          >
            Ajouter
          </button>
        </div>
      </section>

      {activeCategory ? (
        <section className="panel">
          <div className="row-between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <div className="row" style={{ alignItems: "center" }}>
              <h3 className="panel-title" style={{ margin: 0 }}>
                {activeCategory.name}
              </h3>
              <span className={`pill ${activeCategory.isActive ? "" : "pill-inactive"}`}>
                {activeCategory.isActive ? "Active" : "Désactivée"}
              </span>
              <span className="pill">{activeCategory.items.length} produits</span>
            </div>
            <div className="row">
              <button
                className="btn-secondary"
                onClick={() => toggleCategoryActive(activeCategory)}
              >
                {activeCategory.isActive ? "Désactiver" : "Réactiver"}
              </button>
              <button className="btn-danger" onClick={() => deleteCategory(activeCategory)}>
                Supprimer la catégorie
              </button>
            </div>
          </div>

          {activeCategory.items.length === 0 ? (
            <p className="muted">Aucun produit dans cette catégorie.</p>
          ) : (
            <div className="admin-menu-grid">
              {activeCategory.items.map((item) => {
                const isEditing = editingItemId === item.id && editDraft;
                return (
                  <div
                    key={item.id}
                    className={`admin-menu-card ${item.isActive ? "" : "admin-menu-card-inactive"}`}
                  >
                    <div className="admin-menu-card-media">
                      {(isEditing ? editDraft?.imageUrl : item.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(isEditing ? editDraft?.imageUrl : item.imageUrl) as string}
                          alt={item.name}
                          className="menu-thumb"
                        />
                      ) : (
                        <div className="menu-thumb menu-thumb-placeholder">Aucune image</div>
                      )}
                    </div>

                    <div className="admin-menu-card-body">
                      {isEditing ? (
                        <div className="form-grid">
                          <label className="form-field form-field-wide">
                            <span className="form-label">Nom</span>
                            <input
                              value={editDraft.name}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, name: e.target.value } : prev
                                )
                              }
                            />
                          </label>
                          <label className="form-field form-field-wide">
                            <span className="form-label">Description</span>
                            <input
                              value={editDraft.description}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, description: e.target.value } : prev
                                )
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">Prix (centimes)</span>
                            <input
                              type="number"
                              value={editDraft.priceCents}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, priceCents: Number(e.target.value) } : prev
                                )
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">Statut</span>
                            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={editDraft.isActive}
                                onChange={(e) =>
                                  setEditDraft((prev) =>
                                    prev ? { ...prev, isActive: e.target.checked } : prev
                                  )
                                }
                                style={{ width: "auto", minHeight: 0 }}
                              />
                              Produit actif
                            </label>
                          </label>
                          <label className="form-field form-field-wide">
                            <span className="form-label">Image</span>
                            <input
                              value={editDraft.imageUrl}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, imageUrl: e.target.value } : prev
                                )
                              }
                              placeholder="URL"
                            />
                            <div style={{ height: 6 }} />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => onEditImageFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          <div className="row-between" style={{ alignItems: "flex-start" }}>
                            <div>
                              <strong style={{ fontSize: "1.05rem" }}>{item.name}</strong>
                              <p className="muted" style={{ margin: "4px 0 0" }}>
                                {item.description ?? "Aucune description"}
                              </p>
                            </div>
                            <div className="admin-menu-meta">
                              <strong>{(item.priceCents / 100).toFixed(2)} EUR</strong>
                              <span className={`pill ${item.isActive ? "" : "pill-inactive"}`}>
                                {item.isActive ? "Actif" : "Inactif"}
                              </span>
                            </div>
                          </div>
                          {item.options.length > 0 && (
                            <p className="muted" style={{ marginTop: 8 }}>
                              Options:{" "}
                              {item.options
                                .map(
                                  (opt) =>
                                    `${opt.name} (+${(opt.priceDeltaCents / 100).toFixed(2)} EUR)`
                                )
                                .join(", ")}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <div className="admin-menu-card-footer">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(item.id)}>Enregistrer</button>
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setEditingItemId(null);
                              setEditDraft(null);
                            }}
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn-secondary" onClick={() => startEdit(item)}>
                            Modifier
                          </button>
                          {!item.isActive && (
                            <button
                              className="btn-secondary"
                              onClick={async () => {
                                await apiFetch(`/menu/items/${item.id}`, {
                                  method: "PATCH",
                                  headers: { Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ isActive: true })
                                });
                                await load();
                              }}
                            >
                              Réactiver
                            </button>
                          )}
                          <button className="btn-danger" onClick={() => deleteItem(item.id)}>
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <p className="muted">Aucune catégorie pour le moment.</p>
        </section>
      )}
    </div>
  );
}
