"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type VatMode = "TTC_FR_10" | "TTC_FR_20" | "VAT_EXEMPT_ART293B";

type RestaurantInvoice = {
  id: string;
  name: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  billingEmail: string | null;
  siret: string | null;
  vatNumber: string | null;
  logoUrl: string | null;
  invoiceFooterLegal: string | null;
  vatMode: VatMode;
};

export default function FacturationPage() {
  return (
    <main className="facturation-page">
      <TokenGate>{(token) => <FacturationForm token={token} />}</TokenGate>
    </main>
  );
}

function FacturationForm({ token }: { token: string }) {
  const [r, setR] = useState<RestaurantInvoice | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<RestaurantInvoice>("/me/restaurant", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setR(data);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!r) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const form = new FormData(e.currentTarget);
      const body = {
        legalName: emptyToNull(String(form.get("legalName"))),
        addressLine1: emptyToNull(String(form.get("addressLine1"))),
        addressLine2: emptyToNull(String(form.get("addressLine2"))),
        postalCode: emptyToNull(String(form.get("postalCode"))),
        city: emptyToNull(String(form.get("city"))),
        country: emptyToNull(String(form.get("country"))) ?? "FR",
        phone: emptyToNull(String(form.get("phone"))),
        billingEmail: emptyToNull(String(form.get("billingEmail"))),
        siret: emptyToNull(String(form.get("siret"))),
        vatNumber: emptyToNull(String(form.get("vatNumber"))),
        logoUrl: emptyToNull(String(form.get("logoUrl"))),
        invoiceFooterLegal: emptyToNull(String(form.get("invoiceFooterLegal"))),
        vatMode: form.get("vatMode") as VatMode
      };
      const updated = await apiFetch<RestaurantInvoice>("/me/restaurant/invoice-profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      setR(updated);
      setMsg("Enregistré. Les prochaines factures utiliseront ces informations.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (!r) return <p className="muted">Chargement…</p>;

  return (
    <div className="facturation-stack">
      <header className="facturation-head">
        <p className="facturation-kicker">Paramètres</p>
        <h1 className="facturation-title">Facturation &amp; mentions légales</h1>
        <p className="facturation-lead muted">
          Ces champs apparaissent sur les <Link href="/dashboard/caisse">tickets et factures</Link> (logo, adresse,
          SIRET, TVA, pied de page).
        </p>
      </header>

      {msg ? (
        <p className="panel" style={{ borderColor: "color-mix(in oklch, var(--primary), transparent 60%)" }}>
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="panel" role="alert">
          {err}
        </p>
      ) : null}

      <form className="facturation-form panel" onSubmit={(e) => void save(e)}>
        <h2 className="facturation-section-title">Identité</h2>
        <p className="facturation-field muted" style={{ marginTop: 0 }}>
          <strong>Nom commercial :</strong> {r.name}
        </p>
        <label className="facturation-field">
          <span>Raison sociale (si différente)</span>
          <input name="legalName" className="facturation-input" defaultValue={r.legalName ?? ""} />
        </label>
        <label className="facturation-field">
          <span>URL du logo (HTTPS)</span>
          <input name="logoUrl" className="facturation-input" defaultValue={r.logoUrl ?? ""} placeholder="https://…" />
        </label>

        <h2 className="facturation-section-title">Coordonnées</h2>
        <label className="facturation-field">
          <span>Adresse ligne 1</span>
          <input name="addressLine1" className="facturation-input" defaultValue={r.addressLine1 ?? ""} />
        </label>
        <label className="facturation-field">
          <span>Adresse ligne 2</span>
          <input name="addressLine2" className="facturation-input" defaultValue={r.addressLine2 ?? ""} />
        </label>
        <div className="facturation-row">
          <label className="facturation-field">
            <span>Code postal</span>
            <input name="postalCode" className="facturation-input" defaultValue={r.postalCode ?? ""} />
          </label>
          <label className="facturation-field">
            <span>Ville</span>
            <input name="city" className="facturation-input" defaultValue={r.city ?? ""} />
          </label>
        </div>
        <label className="facturation-field">
          <span>Pays (code)</span>
          <input name="country" className="facturation-input" defaultValue={r.country ?? "FR"} maxLength={8} />
        </label>
        <label className="facturation-field">
          <span>Téléphone</span>
          <input name="phone" className="facturation-input" defaultValue={r.phone ?? ""} />
        </label>
        <label className="facturation-field">
          <span>Email affiché sur facture</span>
          <input name="billingEmail" type="email" className="facturation-input" defaultValue={r.billingEmail ?? ""} />
        </label>

        <h2 className="facturation-section-title">Fiscalité</h2>
        <label className="facturation-field">
          <span>SIRET</span>
          <input name="siret" className="facturation-input" defaultValue={r.siret ?? ""} maxLength={20} />
        </label>
        <label className="facturation-field">
          <span>N° TVA intracommunautaire</span>
          <input name="vatNumber" className="facturation-input" defaultValue={r.vatNumber ?? ""} />
        </label>
        <label className="facturation-field">
          <span>Mode TVA sur les prix (facture)</span>
          <select name="vatMode" className="facturation-input" defaultValue={r.vatMode}>
            <option value="TTC_FR_10">Prix TTC — TVA 10,0 % (restauration)</option>
            <option value="TTC_FR_55">Prix TTC — TVA 5,5 %</option>
            <option value="VAT_EXEMPT_ART293B">TVA non applicable — art. 293 B CGI</option>
          </select>
        </label>

        <h2 className="facturation-section-title">Mentions en bas de facture</h2>
        <label className="facturation-field">
          <span>Texte libre (obligations spécifiques, RCS…)</span>
          <textarea
            name="invoiceFooterLegal"
            className="facturation-textarea"
            rows={5}
            defaultValue={r.invoiceFooterLegal ?? ""}
            placeholder="Ex. Capital social, RCS Paris B 123 456 789…"
          />
        </label>

        <div className="facturation-actions">
          <button type="submit" className="btn-primary-ios" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}
