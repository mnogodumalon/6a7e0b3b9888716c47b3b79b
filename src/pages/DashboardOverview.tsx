import { useCallback, useMemo, useState } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Dokumentenpruefung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
// Pre-generated loading/error surfaces (self-repair flow inside) — keep these
// imports and the two early-returns below; never re-implement them here.
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { DokumentenpruefungDetails } from '@/components/details/DokumentenpruefungDetails';
import { DokumentenpruefungDialog, type DokumentenpruefungDialogDefaults } from '@/components/dialogs/DokumentenpruefungDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { IconUpload, IconFileCheck, IconAlertTriangle, IconClock, IconCheck, IconRefresh } from '@tabler/icons-react';
import { tx, appLabel, fieldLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { analyzeDocument, fileToDataUri } from '@/lib/ai';
import { format } from 'date-fns';

// Pre-generated overlay union — one branch per entity, `record` typed the way
// the data flows on this page: Enriched* where enrichment exists, the raw
// record type otherwise. KEEP IT and type your overlay stack with it
// (`useRecordOverlayStack<OverlayItem>()`); never write your own union — a
// hand-written branch that types `record` with the RAW type while the body
// reads an enriched field is the recurring TS2339. Push the ENRICHED records
// into these branches. Delete nothing: unused branches cost nothing (exported
// type), and every entity the user can click needs its branch anyway.
export type OverlayItem =
  | { type: 'dokumentenpruefung'; record: Dokumentenpruefung };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'bestanden') return 'success';
  if (status === 'nicht_bestanden') return 'destructive';
  if (status === 'nachbesserung_erforderlich') return 'warning';
  return 'default'; // ausstehend
}

export default function DashboardOverview() {
  const {
    dokumentenpruefung,
    setDokumentenpruefung,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Dokumentenpruefung | null>(null);
  const [createDefaults, setCreateDefaults] = useState<DokumentenpruefungDialogDefaults | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Dokumentenpruefung | null>(null);

  // AI analysis state
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Columns derived inside component body (locale-aware label getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['dokumentenpruefung']?.['pruefstatus'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Cards mapping
  const cards = useMemo<KanbanCard[]>(
    () => dokumentenpruefung.map(d => {
      const status = lookupKey(d.fields.pruefstatus) ?? 'ausstehend';
      return {
        id: `dok:${d.record_id}`,
        column: status,
        title: d.fields.titel ?? tx('Ohne Titel'),
        subtitle: d.fields.hochladedatum ? formatDate(d.fields.hochladedatum) : undefined,
        tone: toneForStatus(status),
      };
    }),
    [dokumentenpruefung],
  );

  // KPI counts
  const ausstehend = useMemo(() => dokumentenpruefung.filter(d => lookupKey(d.fields.pruefstatus) === 'ausstehend'), [dokumentenpruefung]);
  const nachbesserung = useMemo(() => dokumentenpruefung.filter(d => lookupKey(d.fields.pruefstatus) === 'nachbesserung_erforderlich'), [dokumentenpruefung]);
  const bestanden = useMemo(() => dokumentenpruefung.filter(d => lookupKey(d.fields.pruefstatus) === 'bestanden'), [dokumentenpruefung]);
  const nichtBestanden = useMemo(() => dokumentenpruefung.filter(d => lookupKey(d.fields.pruefstatus) === 'nicht_bestanden'), [dokumentenpruefung]);

  // Optimistic status advance helper
  const advanceStatus = useCallback((doc: Dokumentenpruefung, newStatus: string) => {
    const prev = doc.fields.pruefstatus;
    setDokumentenpruefung(list =>
      list.map(d => d.record_id === doc.record_id
        ? { ...d, fields: { ...d.fields, pruefstatus: lookupOption('dokumentenpruefung', 'pruefstatus', newStatus) } }
        : d,
      ),
    );
    undoToast(
      tx`${doc.fields.titel ?? ''} — ${lookupOption('dokumentenpruefung', 'pruefstatus', newStatus).label}`,
      () => {
        setDokumentenpruefung(list =>
          list.map(d => d.record_id === doc.record_id
            ? { ...d, fields: { ...d.fields, pruefstatus: prev } }
            : d,
          ),
        );
        LivingAppsService.updateDokumentenpruefungEntry(doc.record_id, { pruefstatus: prev ? lookupKey(prev) : undefined }).catch(() => fetchAll());
      },
    );
    LivingAppsService.updateDokumentenpruefungEntry(doc.record_id, { pruefstatus: newStatus }).catch(() => fetchAll());
  }, [setDokumentenpruefung, fetchAll]);

  // AI document analysis
  const analyzeDoc = useCallback(async (doc: Dokumentenpruefung) => {
    if (!doc.fields.dokument) return;
    setAnalyzingId(doc.record_id);
    try {
      const dataUri = await fileToDataUri(await fetch(doc.fields.dokument).then(r => r.blob()).then(b => new File([b], 'dokument')));
      const result = await analyzeDocument(
        dataUri,
        tx('Du bist ein Dokumentenprüfer. Analysiere das Dokument und bewerte es nach folgenden Kriterien:\n1. Vollständigkeit: Sind alle wichtigen Informationen vorhanden?\n2. Korrektheit: Gibt es inhaltliche Fehler oder Unstimmigkeiten?\n3. Formale Anforderungen: Entspricht das Dokument den formalen Standards?\n\nGib eine strukturierte Prüfbewertung zurück mit:\n- Gesamtbewertung: BESTANDEN oder NICHT BESTANDEN oder NACHBESSERUNG ERFORDERLICH\n- Kommentar: Kurze Begründung (2-3 Sätze)'),
      );

      // Parse result
      let newStatus = 'ausstehend';
      const upper = result.toUpperCase();
      if (upper.includes(tx('NICHT BESTANDEN')) || upper.includes('NICHT_BESTANDEN')) newStatus = 'nicht_bestanden';
      else if (upper.includes('NACHBESSERUNG')) newStatus = 'nachbesserung_erforderlich';
      else if (upper.includes('BESTANDEN')) newStatus = 'bestanden';

      // Extract comment (lines after the status line)
      const commentMatch = result.match(/[Kk]ommentar[:\s]+(.+)/s);
      const comment = commentMatch ? commentMatch[1].trim().slice(0, 500) : result.slice(0, 500);

      await LivingAppsService.updateDokumentenpruefungEntry(doc.record_id, {
        pruefstatus: newStatus,
        pruefkommentar: comment,
        prueferdatum: format(clock, 'yyyy-MM-dd'),
      });
      await fetchAll();
      undoToast(tx`KI-Prüfung abgeschlossen — ${lookupOption('dokumentenpruefung', 'pruefstatus', newStatus).label}`);
    } catch {
      undoToast(tx('KI-Prüfung fehlgeschlagen'));
    } finally {
      setAnalyzingId(null);
    }
  }, [clock, fetchAll]);

  // Kanban card move
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const doc = dokumentenpruefung.find(d => d.record_id === rid);
    if (!doc) return;
    advanceStatus(doc, newColumn);
  }, [dokumentenpruefung, advanceStatus]);

  // ─── Every hook goes ABOVE this line: useState, useMemo, useCallback, useRef,
  //     useEffect, useClock, useRecordOverlayStack. A hook below an early return
  //     is called conditionally and crashes the whole page with React #310 —
  //     tsc cannot see it, check-hooks.mjs can. Deriving a value for a widget
  //     prop is the usual reason to reach for useMemo late: put it up there too.
  //     A plain const that a hook READS moves up WITH the hook — "plain
  //     derivations below" only covers values nothing above needs. A live build
  //     left `const today = format(clock, …)` down here; its three useMemo/
  //     useCallback hooks followed it down, and repairing that cost a rewrite of
  //     the whole page. Hooks first, then the consts only the JSX reads.
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only (nothing a hook above reads),
  //     and no hooks. ───

  const pendingNames = namen(ausstehend.map(d => d.fields.titel ?? ''));
  const contextLine = ausstehend.length > 0
    ? tx`${pendingNames} ${ausstehend.length === 1 ? tx('wartet auf Prüfung') : tx('warten auf Prüfung')}.`
    : nachbesserung.length > 0
      ? tx`${namen(nachbesserung.map(d => d.fields.titel ?? ''))} ${nachbesserung.length === 1 ? tx('benötigt Nachbesserung') : tx('benötigen Nachbesserung')}.`
      : dokumentenpruefung.length === 0
        ? tx('Lade dein erstes Dokument hoch.')
        : tx('Alle Dokumente sind geprüft.');

  const openCreate = (defaultStatus?: string) => {
    setEditRecord(null);
    setCreateDefaults(defaultStatus ? { pruefstatus: defaultStatus } : undefined);
    setDialogOpen(true);
  };

  const openEdit = (doc: Dokumentenpruefung) => {
    setEditRecord(doc);
    setCreateDefaults(undefined);
    setDialogOpen(true);
  };

  // Overlay helper
  const openOverlay = (doc: Dokumentenpruefung) => {
    overlay.replace({ type: 'dokumentenpruefung', record: doc });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await LivingAppsService.deleteDokumentenpruefungEntry(deleteTarget.record_id);
    fetchAll();
    setDeleteTarget(null);
    undoToast(tx`${deleteTarget.fields.titel ?? ''} — ${tx('gelöscht')}`);
  };

  // Empty state
  if (dokumentenpruefung.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-muted-foreground">{tx('Lade dein erstes Dokument hoch, um mit der Prüfung zu beginnen.')}</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20 gap-5 text-center">
          <IconFileCheck size={48} className="text-muted-foreground" stroke={1.5} />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{tx('Noch keine Dokumente')}</p>
            <p className="text-sm text-muted-foreground max-w-xs">{tx('Lade ein Dokument hoch — es erhält automatisch den Status "Ausstehend" und kann dann geprüft werden.')}</p>
          </div>
          <Button onClick={() => openCreate()}>
            <IconUpload size={16} className="mr-2 shrink-0" />
            {tx('Erstes Dokument hochladen')}
          </Button>
        </div>
        <DokumentenpruefungDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSubmit={async (fields) => { await LivingAppsService.createDokumentenpruefungEntry(fields); fetchAll(); }}
          defaultValues={createDefaults}
          enablePhotoScan={AI_PHOTO_SCAN['Dokumentenpruefung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Dokumentenpruefung']}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-muted-foreground">{contextLine}</p>
        </div>
        <Button onClick={() => openCreate()} className="shrink-0">
          <IconUpload size={16} className="mr-2 shrink-0" />
          {tx('Dokument hochladen')}
        </Button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={nachbesserung.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Als geprüft markieren'),
              onClick: () => advanceStatus(nachbesserung[0], 'ausstehend'),
            }}
          >
            <b>{namen(nachbesserung.map(d => d.fields.titel ?? ''))}</b>{' '}
            {nachbesserung.length === 1
              ? tx('benötigt Nachbesserung')
              : tx('benötigen Nachbesserung')
            }.
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Ausstehend')}
              value={ausstehend.length}
              icon={<IconClock size={16} />}
              tone={ausstehend.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Bestanden')}
              value={bestanden.length}
              icon={<IconCheck size={16} />}
              tone={bestanden.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Nicht bestanden')}
              value={nichtBestanden.length}
              icon={<IconAlertTriangle size={16} />}
              tone={nichtBestanden.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tx('Nachbesserung')}
              value={nachbesserung.length}
              icon={<IconRefresh size={16} />}
              tone={nachbesserung.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['bestanden', 'nicht_bestanden']}
            onCardClick={card => {
              const rid = card.id.split(':')[1] ?? '';
              const doc = dokumentenpruefung.find(d => d.record_id === rid);
              if (doc) openOverlay(doc);
            }}
            onCardMove={moveCard}
            onAddCard={column => openCreate(column)}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Ausstehende Prüfungen')}
              items={ausstehend.slice(0, 8).map(d => ({
                id: d.record_id,
                title: d.fields.titel ?? tx('Ohne Titel'),
                secondLine: (
                  <span className="text-muted-foreground text-sm">
                    {d.fields.hochladedatum ? formatDate(d.fields.hochladedatum) : tx('Kein Datum')}
                  </span>
                ),
                action: {
                  label: tx('Bestätigen'),
                  onClick: () => advanceStatus(d, 'bestanden'),
                },
              }))}
              onItemClick={id => {
                const doc = dokumentenpruefung.find(d => d.record_id === id);
                if (doc) openOverlay(doc);
              }}
              empty={{
                text: tx('Alle Dokumente sind geprüft — super!'),
                action: { label: tx('Dokument hochladen'), onClick: () => openCreate() },
              }}
            />
            <WorkList
              title={tx('KI-Analyse verfügbar')}
              items={dokumentenpruefung
                .filter(d => d.fields.dokument && lookupKey(d.fields.pruefstatus) === 'ausstehend')
                .slice(0, 5)
                .map(d => ({
                  id: d.record_id,
                  title: d.fields.titel ?? tx('Ohne Titel'),
                  secondLine: (
                    <span className="text-xs text-muted-foreground">
                      {analyzingId === d.record_id ? tx('Analyse läuft…') : tx('Dokument vorhanden')}
                    </span>
                  ),
                  action: {
                    label: analyzingId === d.record_id ? tx('…') : tx('KI prüfen'),
                    onClick: () => { void analyzeDoc(d); },
                  },
                }))}
              onItemClick={id => {
                const doc = dokumentenpruefung.find(d => d.record_id === id);
                if (doc) openOverlay(doc);
              }}
              empty={{
                text: tx('Keine Dokumente mit KI-Analyse bereit.'),
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <DokumentenpruefungDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={async (fields) => {
          if (editRecord) {
            await LivingAppsService.updateDokumentenpruefungEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createDokumentenpruefungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRecord ? editRecord.fields : createDefaults}
        recordId={editRecord?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Dokumentenpruefung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Dokumentenpruefung']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={tx('Dokument löschen')}
        description={tx('Dieses Dokument und alle zugehörigen Prüfdaten werden unwiderruflich gelöscht.')}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Single overlay host for the whole stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'dokumentenpruefung') {
            const doc = top.record;
            return (
              <>
                <RecordHeader
                  title={doc.fields.titel ?? tx('Ohne Titel')}
                  subtitle={doc.fields.pruefstatus?.label}
                />
                <DokumentenpruefungDetails record={doc} />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'dokumentenpruefung') {
            const doc = top.record;
            const status = lookupKey(doc.fields.pruefstatus);
            if (status === 'ausstehend') {
              return {
                label: tx('Als bestanden markieren'),
                onClick: () => { advanceStatus(doc, 'bestanden'); overlay.close(); },
              };
            }
            if (status === 'nachbesserung_erforderlich') {
              return {
                label: tx('Zurück zu ausstehend'),
                onClick: () => { advanceStatus(doc, 'ausstehend'); overlay.close(); },
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'dokumentenpruefung') {
            openEdit(top.record);
            overlay.close();
          }
        }}
      />
    </div>
  );
}
