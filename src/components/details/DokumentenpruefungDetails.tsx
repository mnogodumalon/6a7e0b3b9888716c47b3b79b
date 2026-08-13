import type { Dokumentenpruefung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';

export interface DokumentenpruefungDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Dokumentenpruefung;
}

export function DokumentenpruefungDetails({
  record,
}: DokumentenpruefungDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('dokumentenpruefung', 'titel')} value={record.fields.titel} format="text" />
        <RecordField label={fieldLabel('dokumentenpruefung', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('dokumentenpruefung', 'dokument')} className="md:col-span-2">
          {record.fields.dokument ? (
            <MediaThumbnail src={record.fields.dokument as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
        <RecordField label={fieldLabel('dokumentenpruefung', 'hochladedatum')} value={record.fields.hochladedatum} format="date" />
        <RecordField label={fieldLabel('dokumentenpruefung', 'pruefstatus')} value={record.fields.pruefstatus} format="pill" />
        <RecordField label={fieldLabel('dokumentenpruefung', 'pruefkommentar')} value={record.fields.pruefkommentar} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('dokumentenpruefung', 'prueferdatum')} value={record.fields.prueferdatum} format="date" />
        <RecordField label={fieldLabel('dokumentenpruefung', 'pruefer')} value={record.fields.pruefer} format="text" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.DOKUMENTENPRUEFUNG} recordId={record.record_id} />
    </>
  );
}
