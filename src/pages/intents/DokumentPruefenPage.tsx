/**
 * Dokument prüfen — 3-Schritt-Wizard.
 * Steps: 1) Dokument wählen (nur ausstehend|nachbesserung_erforderlich) →
 *         2) Prüfung durchführen (pruefkommentar, pruefer, prueferdatum, pruefstatus) →
 *         3) Zusammenfassung & Bestätigen.
 * Reads: dokumentenpruefung. Writes: dokumentenpruefung (updateDokumentenpruefungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { IconClipboardCheck, IconAlertCircle } from '@tabler/icons-react';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { LOOKUP_OPTIONS } from '@/types/app';
import type { Dokumentenpruefung } from '@/types/app';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const PRUEF_STATUS_OPTIONS = LOOKUP_OPTIONS['dokumentenpruefung']?.['pruefstatus'] ?? [];
const RESULT_OPTIONS = PRUEF_STATUS_OPTIONS.filter(
  o => o.key === 'bestanden' || o.key === 'nicht_bestanden',
);

export default function DokumentPruefenPage() {
  const { dokumentenpruefung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pruefkommentar, setPruefkommentar] = useState('');
  const [pruefer, setPruefer] = useState('');
  const [prueferdatum, setPrueferdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pruefstatusKey, setPruefstatusKey] = useState(RESULT_OPTIONS[0]?.key ?? 'bestanden');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const eligibleDokumente = (dokumentenpruefung as Dokumentenpruefung[]).filter(d => {
    const key = d.fields.pruefstatus?.key;
    return key === 'ausstehend' || key === 'nachbesserung_erforderlich';
  });

  const selectedDoc = selectedId
    ? (dokumentenpruefung as Dokumentenpruefung[]).find(d => d.record_id === selectedId) ?? null
    : null;

  const selectedStatusOption = PRUEF_STATUS_OPTIONS.find(o => o.key === pruefstatusKey);

  const handleSelectDoc = (id: string) => {
    setSelectedId(id);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateDokumentenpruefungEntry(selectedId, {
        pruefkommentar,
        pruefer,
        prueferdatum,
        pruefstatus: pruefstatusKey,
      });
      await fetchAll();
      setDone(true);
      setStep(3);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Speichern.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedId(null);
    setPruefkommentar('');
    setPruefer('');
    setPrueferdatum(format(new Date(), 'yyyy-MM-dd'));
    setPruefstatusKey(RESULT_OPTIONS[0]?.key ?? 'bestanden');
    setSubmitError(null);
    setDone(false);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Dokument prüfen')}
      subtitle={tx('Prüfprozess in drei Schritten abschließen')}
      steps={[
        { label: tx('Dokument wählen') },
        { label: tx('Prüfung durchführen') },
        { label: tx('Zusammenfassung') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Dokument wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleDokumente.map(d => ({
            id: d.record_id,
            title: d.fields.titel ?? d.record_id,
            subtitle: d.fields.hochladedatum
              ? `${tx('Hochgeladen')}: ${d.fields.hochladedatum}`
              : undefined,
            status: d.fields.pruefstatus
              ? { key: d.fields.pruefstatus.key, label: d.fields.pruefstatus.label }
              : undefined,
            icon: <IconClipboardCheck size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectDoc}
          searchPlaceholder={tx('Dokument suchen …')}
          emptyText={tx('Keine Dokumente zur Prüfung ausstehend.')}
          emptyIcon={<IconAlertCircle size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Prüfung durchführen */}
      {step === 2 && (
        <div className="space-y-6">
          {!selectedDoc ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          ) : (
            <>
              {/* Context: aktuelles Dokument */}
              <div className="rounded-2xl border bg-card p-4 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {tx('Ausgewähltes Dokument')}
                </p>
                <p className="font-semibold text-foreground truncate">
                  {selectedDoc.fields.titel ?? selectedDoc.record_id}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedDoc.fields.hochladedatum && (
                    <span className="text-sm text-muted-foreground">
                      {tx('Hochgeladen')}: {selectedDoc.fields.hochladedatum}
                    </span>
                  )}
                  {selectedDoc.fields.pruefstatus && (
                    <StatusBadge
                      statusKey={selectedDoc.fields.pruefstatus.key}
                      label={selectedDoc.fields.pruefstatus.label}
                    />
                  )}
                </div>
              </div>

              {/* Prüfformular */}
              <div className="space-y-4">
                {/* pruefstatus — nur bestanden / nicht_bestanden */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{tx('Prüfergebnis')}</Label>
                  <div className="flex gap-3 flex-wrap">
                    {RESULT_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPruefstatusKey(opt.key)}
                        className={`flex-1 min-w-[130px] rounded-xl border px-4 py-3 text-sm font-medium transition-colors
                          ${pruefstatusKey === opt.key
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:bg-secondary'
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* pruefer — required */}
                <div className="space-y-2">
                  <Label htmlFor="pruefer" className="text-sm font-medium">
                    {tx('Prüfer')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pruefer"
                    value={pruefer}
                    onChange={e => setPruefer(e.target.value)}
                    placeholder={tx('Name des Prüfers')}
                  />
                </div>

                {/* prueferdatum — required */}
                <div className="space-y-2">
                  <Label htmlFor="prueferdatum" className="text-sm font-medium">
                    {tx('Prüfdatum')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="prueferdatum"
                    type="date"
                    value={prueferdatum}
                    onChange={e => setPrueferdatum(e.target.value)}
                  />
                </div>

                {/* pruefkommentar */}
                <div className="space-y-2">
                  <Label htmlFor="pruefkommentar" className="text-sm font-medium">
                    {tx('Prüfkommentar')}
                  </Label>
                  <Textarea
                    id="pruefkommentar"
                    value={pruefkommentar}
                    onChange={e => setPruefkommentar(e.target.value)}
                    placeholder={tx('Optionaler Kommentar zur Prüfung …')}
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  {tx('Zurück')}
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!pruefer || !prueferdatum}
                  className="flex-1"
                >
                  {tx('Weiter zur Zusammenfassung')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Zusammenfassung & Bestätigen */}
      {step === 3 && (
        <div className="space-y-6">
          {!selectedDoc && !done ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          ) : done ? (
            /* Erfolgsansicht */
            <div className="text-center py-10 space-y-4">
              <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto">
                <IconClipboardCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-foreground">{tx('Prüfung gespeichert')}</p>
                <p className="text-sm text-muted-foreground">
                  {tx('Das Dokument wurde erfolgreich geprüft.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset} variant="default">
                  {tx('Weiteres Dokument prüfen')}
                </Button>
                <a href="#/">
                  <Button variant="outline" className="w-full sm:w-auto">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            /* Zusammenfassung vor Bestätigung */
            <>
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-secondary/30">
                  <p className="text-sm font-semibold text-foreground">{tx('Zusammenfassung')}</p>
                </div>
                <div className="divide-y">
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tx('Dokument')}</span>
                    <span className="text-sm font-medium text-foreground truncate max-w-[60%] text-right">
                      {selectedDoc?.fields.titel ?? selectedDoc?.record_id}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tx('Prüfer')}</span>
                    <span className="text-sm font-medium text-foreground">{pruefer}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tx('Prüfdatum')}</span>
                    <span className="text-sm font-medium text-foreground">{prueferdatum}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tx('Ergebnis')}</span>
                    <StatusBadge
                      statusKey={pruefstatusKey}
                      label={selectedStatusOption?.label ?? pruefstatusKey}
                    />
                  </div>
                  {pruefkommentar && (
                    <div className="px-4 py-3 space-y-1">
                      <p className="text-sm text-muted-foreground">{tx('Kommentar')}</p>
                      <p className="text-sm text-foreground">{pruefkommentar}</p>
                    </div>
                  )}
                </div>
              </div>

              {submitError && (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 flex items-start gap-2">
                  <IconAlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{submitError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1" disabled={submitting}>
                  {tx('Zurück')}
                </Button>
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                  {submitting ? tx('Wird gespeichert …') : tx('Prüfung bestätigen')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
